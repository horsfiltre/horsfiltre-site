export class ErreurApi extends Error {
  constructor(statut, code, titre, erreurs) {
    super(titre);
    this.statut = statut; this.code = code; this.erreurs = erreurs ?? {};
  }
}

/** Client de l'API d'administration. Un 401 déclenche un renouvellement du jeton, une seule fois. */
export function creerClient({ base, jeton, rafraichir, fetchImpl = fetch }) {
  async function appeler(methode, chemin, { requete, corps } = {}) {
    const url = new URL(base.replace(/\/+$/, '') + chemin);
    for (const [k, v] of Object.entries(requete ?? {})) url.searchParams.set(k, v);
    const essayer = async () => fetchImpl(url, {
      method: methode,
      headers: { authorization: `Bearer ${await jeton()}`, ...(corps ? { 'content-type': 'application/json' } : {}) },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    });
    let r;
    try {
      r = await essayer();
    } catch (e) {
      if (!(e instanceof TypeError)) throw e;
      // Aucune réponse lisible : réseau coupé, ou refus de la passerelle sans en-têtes CORS (un jeton expiré ou révoqué se
      // présente ainsi dans un navigateur). Seule une lecture est rejouée : rejouer une écriture risquerait de la doubler.
      if (methode === 'GET' && (await rafraichir())) {
        try { r = await essayer(); } catch { r = undefined; }
      }
      if (!r) throw new ErreurApi(0, 'reseau', 'Impossible de joindre le serveur. Vérifiez votre connexion, ou rechargez la page pour vous reconnecter.');
    }
    if (r.status === 401 && (await rafraichir())) r = await essayer();
    if (r.status === 204) return null;
    const texte = await r.text();
    let donnees = null;
    try { donnees = texte ? JSON.parse(texte) : null; } catch { /* corps qui n'est pas du JSON */ }
    if (!r.ok) throw new ErreurApi(r.status, donnees?.code, donnees?.title ?? donnees?.message ?? `Erreur ${r.status}`, donnees?.erreurs);
    return donnees;
  }
  return {
    get: (chemin, requete) => appeler('GET', chemin, { requete }),
    post: (chemin, corps) => appeler('POST', chemin, { corps }),
    put: (chemin, corps) => appeler('PUT', chemin, { corps }),
    patch: (chemin, corps) => appeler('PATCH', chemin, { corps }),
    supprimer: (chemin) => appeler('DELETE', chemin),
  };
}

/** Un message lisible pour une erreur, avec le détail champ par champ s'il y en a. */
export function messageErreur(e) {
  if (!(e instanceof ErreurApi)) return "Une erreur s'est produite. Réessayez dans un instant.";
  const details = Object.values(e.erreurs ?? {});
  return details.length ? `${e.message} ${details.join(' ')}` : e.message;
}
