// Vérification du jeton anti-robot auprès de Cloudflare. La clé secrète ne quitte jamais le serveur.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
export type VerificationTurnstile = 'ok' | 'invalide' | 'indisponible';

export const URL_VERIFICATION = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type Options = {
  secret: string;
  /** Noms d'hôte sur lesquels le widget peut légitimement s'afficher ; un jeton émis ailleurs est refusé. */
  hotesAutorises?: readonly string[];
  /** Remplaçable dans les tests. */
  fetchImpl?: typeof fetch;
  delaiMs?: number;
};

export function creerVerificateurTurnstile(options: Options): (jeton: string, ip?: string) => Promise<VerificationTurnstile> {
  const { secret, hotesAutorises, fetchImpl = fetch, delaiMs = 5000 } = options;
  return async (jeton, ip) => {
    const corps = new URLSearchParams({ secret, response: jeton });
    if (ip) corps.set('remoteip', ip);
    let reponse: Response;
    try {
      reponse = await fetchImpl(URL_VERIFICATION, { method: 'POST', body: corps, signal: AbortSignal.timeout(delaiMs) });
    } catch {
      return 'indisponible'; // réseau coupé, délai dépassé : on ne laisse pas passer, mais on ne dit pas « robot »
    }
    if (!reponse.ok) return 'indisponible';
    let donnees: { success?: boolean; hostname?: string };
    try {
      donnees = (await reponse.json()) as typeof donnees;
    } catch {
      return 'indisponible';
    }
    if (donnees.success !== true) return 'invalide';
    if (hotesAutorises && (!donnees.hostname || !hotesAutorises.includes(donnees.hostname))) return 'invalide';
    return 'ok';
  };
}
