// Tient les créneaux à jour par rapport aux règles et aux absences, sur la fenêtre glissante de réservation.
// Idempotente : on peut la lancer après chaque modification de l'administration, et chaque jour pour décaler la fenêtre.
//
// - un créneau voulu et absent est créé ;
// - un créneau issu d'une règle qui n'est plus voulu (règle modifiée ou supprimée, absence ajoutée, accompagnant désactivé)
//   est supprimé s'il est libre ou fermé ;
// - un créneau qui n'est plus voulu mais qui porte une réservation n'est JAMAIS supprimé : il est signalé,
//   et l'équipe décide (prévenir la personne, reporter ou annuler) ;
// - un créneau ponctuel n'est jamais touché.
import { HORIZON_JOURS } from './constantes.mts';
import { genererCreneaux, type Creneau } from './creneaux.mts';
import type { Stockage } from './stockage.mts';
import { ajouterJours, dateParis, instantParis } from './temps.mts';

export type BilanSynchronisation = {
  ajoutes: number;
  retires: number;
  /** Créneaux réservés qui ne correspondent plus aux règles : à traiter à la main. */
  conflits: Creneau[];
};

/** Ce que les règles, les absences et les accompagnants actifs demandent, face à ce qui existe. Ne modifie rien. */
async function planifier(stockage: Stockage, maintenant: Date) {
  const depuis = dateParis(maintenant);
  const jusqua = ajouterJours(depuis, HORIZON_JOURS);

  const accompagnants = (await stockage.listerAccompagnants()).filter((a) => a.actif);
  const regles = (await Promise.all(accompagnants.map((a) => stockage.listerRegles(a.id)))).flat();
  const absences = (await Promise.all(accompagnants.map((a) => stockage.listerAbsences(a.id)))).flat();
  const voulus = genererCreneaux({ regles, absences, depuis, jusqua });

  const existants = await stockage.listerCreneaux(instantParis(depuis, '00:00').toISOString(), instantParis(jusqua, '23:59').toISOString());
  return { voulus, existants, idsExistants: new Set(existants.map((c) => c.id)), idsVoulus: new Set(voulus.map((c) => c.id)) };
}

/**
 * Les créneaux réservés qui ne correspondent plus aux règles, aux absences ou aux accompagnants actifs.
 * Lecture seule : sert à prévenir l'équipe, qui décide de reporter ou d'annuler.
 */
export async function diagnostiquerConflits(stockage: Stockage, maintenant: Date): Promise<Creneau[]> {
  const { existants, idsVoulus } = await planifier(stockage, maintenant);
  return existants.filter((c) => c.origine === 'regle' && c.statut === 'reserve' && !idsVoulus.has(c.id));
}

export async function synchroniserCreneaux(stockage: Stockage, maintenant: Date): Promise<BilanSynchronisation> {
  const { voulus, existants, idsExistants, idsVoulus } = await planifier(stockage, maintenant);

  const aAjouter = voulus.filter((c) => !idsExistants.has(c.id));
  await stockage.ecrireCreneaux(aAjouter);

  let retires = 0;
  const conflits: Creneau[] = [];
  for (const c of existants) {
    if (c.origine !== 'regle' || idsVoulus.has(c.id)) continue;
    if (c.statut === 'reserve') {
      conflits.push(c);
      continue;
    }
    const resultat = await stockage.supprimerCreneau(c.id);
    if (resultat === 'supprime') retires++;
    else if (resultat === 'reserve') conflits.push({ ...c, statut: 'reserve' }); // réservé entre la lecture et la suppression
  }
  return { ajoutes: aAjouter.length, retires, conflits };
}
