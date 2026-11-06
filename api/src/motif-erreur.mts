// Le motif d'un échec, assez précis pour être diagnostiqué depuis le journal, et sans aucune donnée personnelle.
//
// Un nom d'erreur seul (« AccessDeniedException ») ne dit pas QUELLE ressource a été refusée : c'est le message d'AWS qui
// le dit (« … is not authorized to perform `ses:SendEmail' on resource `arn:aws:ses:…:identity/…' »). Mais SES cite parfois
// le destinataire dans ses messages : chaque adresse garde son domaine (utile au diagnostic) et perd sa partie locale.

const LONGUEUR_MAX_MESSAGE = 500;

/** `prenom.nom@exemple.fr` devient `***@exemple.fr`, où qu'elle soit dans le texte (ARN compris). */
export function masquerAdresses(texte: string): string {
  return texte.replace(/[^\s@'"`<>(),;:/\\[\]]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi, '***@$1');
}

export type Motif = { erreur: string; message?: string; statut?: number };

export function motifErreur(e: unknown): Motif {
  if (!(e instanceof Error)) return { erreur: 'inconnue' };
  const statut = (e as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode;
  const message = e.message ? masquerAdresses(e.message).slice(0, LONGUEUR_MAX_MESSAGE) : undefined;
  return { erreur: e.name, ...(message ? { message } : {}), ...(typeof statut === 'number' ? { statut } : {}) };
}
