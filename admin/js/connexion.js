// Connexion « authorization code » avec PKCE, via la page de connexion hébergée par Cognito (ADR-0005).
// Le jeton ne quitte jamais la mémoire de la page : ni localStorage, ni cookie. Seul le secret PKCE, à usage unique,
// traverse la redirection, dans sessionStorage (propre à l'onglet, vidé à sa fermeture).
export const base64url = (octets) => btoa(String.fromCharCode(...octets)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export const creerVerificateur = () => base64url(crypto.getRandomValues(new Uint8Array(48)));
export const creerEtat = () => base64url(crypto.getRandomValues(new Uint8Array(24)));
export async function defiDepuis(verificateur) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificateur))));
}

export function urlAutorisation({ cognito, clientId, retour, etat, defi }) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: retour, scope: 'openid email', state: etat, code_challenge: defi, code_challenge_method: 'S256' });
  return `${cognito.replace(/\/+$/, '')}/oauth2/authorize?${q}`;
}

export function urlDeconnexion({ cognito, clientId, retour }) {
  return `${cognito.replace(/\/+$/, '')}/logout?${new URLSearchParams({ client_id: clientId, logout_uri: retour })}`;
}

/** Lit le retour de Cognito. Un état différent est un rejeu : refusé. */
export function lireRetour(recherche, etatAttendu) {
  const p = new URLSearchParams(recherche);
  if (p.get('error')) return { ok: false, raison: p.get('error') };
  const etat = p.get('state') ?? '';
  let ecart = etat.length ^ etatAttendu.length;
  for (let i = 0; i < Math.min(etat.length, etatAttendu.length); i++) ecart |= etat.charCodeAt(i) ^ etatAttendu.charCodeAt(i);
  if (!etatAttendu || ecart !== 0) return { ok: false, raison: 'etat_different' };
  const code = p.get('code');
  return code ? { ok: true, code } : { ok: false, raison: 'code_manquant' };
}

async function jetons(cognito, corps, fetchImpl) {
  const r = await fetchImpl(`${cognito.replace(/\/+$/, '')}/oauth2/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(corps) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(d.error ?? `refus (${r.status})`);
  // Le jeton d'identité porte l'adresse (affichage seulement) ; le jeton d'accès porte les groupes et va seul à l'API.
  return { accessToken: d.access_token, idToken: d.id_token, refreshToken: d.refresh_token, expireA: Date.now() + (d.expires_in ?? 3600) * 1000 };
}

export const echangerCode = ({ cognito, clientId, retour, code, verificateur, fetchImpl = fetch }) =>
  jetons(cognito, { grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: retour, code_verifier: verificateur }, fetchImpl);

export const rafraichirJeton = ({ cognito, clientId, refreshToken, fetchImpl = fetch }) =>
  jetons(cognito, { grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }, fetchImpl);

/** Ce que le jeton annonce. Pour l'affichage seulement : la vérification est faite par API Gateway. */
export function lireRevendications(jeton) {
  try {
    const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(jeton.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')), (x) => x.charCodeAt(0))));
    return { groupes: Array.isArray(c['cognito:groups']) ? c['cognito:groups'] : [], courriel: typeof c.email === 'string' ? c.email : undefined };
  } catch {
    return { groupes: [] };
  }
}

/**
 * La session : le jeton est gardé dans cette closure, rien d'autre ne le lit.
 * `demarrer()` rend « connecte » ou « redirige » (la page part alors vers Cognito).
 */
export function creerSession({ config, lieu = location, historique = history, stockage = sessionStorage, fetchImpl = fetch }) {
  const retour = `${lieu.origin}/`;
  let etatJeton;

  async function demarrerConnexion() {
    const verificateur = creerVerificateur();
    const etat = creerEtat();
    stockage.setItem('pkce', JSON.stringify({ verificateur, etat }));
    lieu.assign(urlAutorisation({ cognito: config.cognito, clientId: config.clientId, retour, etat, defi: await defiDepuis(verificateur) }));
  }

  return {
    async demarrer() {
      const recherche = lieu.search; // à lire AVANT d'effacer l'adresse : replaceState vide aussi location.search
      const p = new URLSearchParams(recherche);
      if (p.has('code') || p.has('error')) {
        const memoire = JSON.parse(stockage.getItem('pkce') ?? 'null');
        stockage.removeItem('pkce'); // à usage unique
        historique.replaceState({}, '', '/'); // le code et l'état ne restent pas dans l'adresse, ni dans l'historique
        if (!memoire) throw new Error('connexion_interrompue');
        const retourCognito = lireRetour(recherche, memoire.etat);
        if (!retourCognito.ok) throw new Error(retourCognito.raison);
        etatJeton = await echangerCode({ cognito: config.cognito, clientId: config.clientId, retour, code: retourCognito.code, verificateur: memoire.verificateur, fetchImpl });
        return 'connecte';
      }
      if (!etatJeton) { await demarrerConnexion(); return 'redirige'; }
      return 'connecte';
    },
    async jeton() {
      if (etatJeton && Date.now() > etatJeton.expireA - 60_000) await this.rafraichir();
      return etatJeton?.accessToken;
    },
    /** Renouvelle le jeton ; faux si c'est impossible (la page repart alors vers la connexion). */
    async rafraichir() {
      if (!etatJeton?.refreshToken) return false;
      try {
        const nouveau = await rafraichirJeton({ cognito: config.cognito, clientId: config.clientId, refreshToken: etatJeton.refreshToken, fetchImpl });
        etatJeton = { ...nouveau, idToken: nouveau.idToken ?? etatJeton.idToken, refreshToken: nouveau.refreshToken ?? etatJeton.refreshToken };
        return true;
      } catch {
        etatJeton = undefined;
        return false;
      }
    },
    revendications: () => {
      if (!etatJeton) return { groupes: [] };
      const { groupes } = lireRevendications(etatJeton.accessToken);
      const courriel = etatJeton.idToken ? lireRevendications(etatJeton.idToken).courriel : undefined;
      return { groupes, courriel };
    },
    reconnecter: demarrerConnexion,
    deconnecter() {
      etatJeton = undefined;
      lieu.assign(urlDeconnexion({ cognito: config.cognito, clientId: config.clientId, retour }));
    },
  };
}
