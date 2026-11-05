// Les rappels de la veille et d'une heure avant, déclenchés par le temps (toutes les 5 minutes), jamais par une action.
// Chaque rappel est réclamé AVANT l'envoi par une écriture atomique : même si deux exécutions se chevauchent, une seule envoie.
import { creerJeton, messageRappel, type Reservation, type Stockage } from '../../shared/src/index.mts';
import type { Envoyeur } from './courriel.mts';
import { contenuAccompagnant, envoyerSurs, lienDeGestion, type Journal } from './notifications.mts';

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;

export type DependancesRappels = {
  stockage: Stockage;
  envoyer: Envoyeur;
  secretJeton: string;
  urlSite: string;
  maintenant: () => Date;
  journal: Journal;
};
export type BilanRappels = { veille: number; heure: number; ignores: number; echecs: number };

/**
 * Quel rappel, s'il y en a un, une réservation doit-elle recevoir maintenant ?
 * - « heure » : le créneau commence dans 45 à 65 minutes ;
 * - « veille » : il commence dans 23 h à 24 h 05, ET la réservation date de plus de 24 h avant le début
 *   (réservée la veille au soir pour le lendemain matin, la personne vient de recevoir sa confirmation : pas de rappel).
 */
export function rappelDu(r: Reservation, maintenant: Date): 'veille' | 'heure' | undefined {
  const delai = Date.parse(r.debut) - maintenant.getTime();
  if (delai > 45 * MINUTE && delai <= 65 * MINUTE) return 'heure';
  if (delai > 23 * HEURE && delai <= 24 * HEURE + 5 * MINUTE && Date.parse(r.creeLe) <= Date.parse(r.debut) - 24 * HEURE) return 'veille';
  return undefined;
}

export async function executerRappels(d: DependancesRappels): Promise<BilanRappels> {
  const maintenant = d.maintenant();
  const bilan: BilanRappels = { veille: 0, heure: 0, ignores: 0, echecs: 0 };
  const candidates = (await d.stockage.listerReservations(maintenant.toISOString(), new Date(maintenant.getTime() + 25 * HEURE).toISOString())).filter((r) => r.statut === 'confirmee');

  for (const r of candidates) {
    const type = rappelDu(r, maintenant);
    if (!type) continue;
    if (await d.stockage.adresseInjoignable(r.empreinteEmail)) { bilan.ignores++; continue; }
    // Réclamé avant l'envoi : exactement un envoi ou aucun. Un échec est journalisé, et l'alarme prévient l'équipe.
    if (!(await d.stockage.marquerRappelEnvoye(r.id, r.debut, type))) continue;
    const ok = await envoyerSurs(d, `rappel_${type}`, r.id, async () => {
      const acc = await contenuAccompagnant(d.stockage, r);
      const jeton = creerJeton(d.secretJeton, r.id, new Date(r.debut)); // lien régénéré : il ne dépend que de la réservation
      return { a: r.email, ...messageRappel(r, acc, { consulter: lienDeGestion(d.urlSite, jeton), annuler: '', reporter: '' }, type) };
    });
    if (ok) bilan[type]++; else bilan.echecs++;
  }
  d.journal({ niveau: 'info', evenement: 'rappels_executes', ...bilan });
  return bilan;
}
