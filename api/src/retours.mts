// Les retours de SES (rebonds définitifs, plaintes) arrivent par EventBridge. Une adresse qui rebondit pour de bon, ou dont la
// personne se plaint, est marquée injoignable : on ne lui écrit plus, et elle ne peut plus réserver avec. Seule l'empreinte
// de l'adresse est gardée. C'est l'engagement pris auprès d'AWS dans la demande de sortie du mode d'essai.
import { empreinteEmail, type Stockage } from '../../shared/src/index.mts';
import type { Journal } from './notifications.mts';

const objet = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const adresses = (liste: unknown): string[] =>
  (Array.isArray(liste) ? liste : []).map((x) => objet(x).emailAddress).filter((a): a is string => typeof a === 'string' && a.length > 3 && a.length <= 254 && a.includes('@'));

/** Rend le nombre d'adresses marquées. Un rebond passager (boîte pleine) n'en marque aucune : il peut se résoudre. */
export async function traiterRetour(stockage: Stockage, evenement: unknown, maintenant: Date, journal: Journal): Promise<number> {
  const detail = objet(objet(evenement).detail);
  const type = detail.eventType;
  let motif: 'rebond' | 'plainte' | undefined;
  let destinataires: string[] = [];
  if (type === 'Bounce' && objet(detail.bounce).bounceType === 'Permanent') { motif = 'rebond'; destinataires = adresses(objet(detail.bounce).bouncedRecipients); }
  else if (type === 'Complaint') { motif = 'plainte'; destinataires = adresses(objet(detail.complaint).complainedRecipients); }

  if (!motif) { journal({ niveau: 'info', evenement: 'retour_ignore', type: typeof type === 'string' ? type : 'inconnu' }); return 0; }
  for (const a of destinataires) await stockage.marquerAdresseInjoignable(empreinteEmail(a), motif, maintenant.toISOString());
  journal({ niveau: 'info', evenement: 'adresses_marquees', motif, nombre: destinataires.length }); // jamais l'adresse
  return destinataires.length;
}
