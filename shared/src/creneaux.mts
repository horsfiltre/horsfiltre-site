// Génération et visibilité des créneaux de premier échange.
import {
  DELAI_MINIMUM_HEURES,
  DUREE_MINUTES,
  HORIZON_JOURS,
  PAUSE_MINUTES,
  type Jour,
} from './constantes.mts';
import { identifiantCreneau } from './identifiants.mts';
import { ajouterJours, ajouterMinutes, dateParis, instantParis, jourDeLaSemaine } from './temps.mts';

export type Regle = {
  id: string;
  accompagnantId: string;
  jour: Jour;
  /** HH:MM, heure de Paris. */
  debut: string;
  /** HH:MM, heure de Paris. Le dernier échange se termine au plus tard à cette heure. */
  fin: string;
  /** AAAA-MM-JJ, inclus. */
  valideDu: string;
  /** AAAA-MM-JJ, inclus. Absent : sans fin. */
  valideAu?: string | null;
};

export type Absence = {
  id: string;
  accompagnantId: string;
  /** Instants ISO 8601. */
  du: string;
  au: string;
  /** Texte libre de l'équipe, jamais montré aux visiteurs. */
  motif?: string | null;
};

export type StatutCreneau = 'libre' | 'reserve' | 'ferme';

export type Creneau = {
  id: string;
  accompagnantId: string;
  /** Instants ISO 8601, en UTC. */
  debut: string;
  fin: string;
  statut: StatutCreneau;
  origine: 'regle' | 'ponctuel';
  regleId?: string | null;
  reservationId?: string | null;
};

const enMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};
const enHeure = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Débuts possibles dans une plage : un échange, une pause, un échange, et ainsi de suite. */
export function debutsDansPlage(debut: string, fin: string): string[] {
  const pas = DUREE_MINUTES + PAUSE_MINUTES;
  const limite = enMinutes(fin);
  const resultat: string[] = [];
  for (let t = enMinutes(debut); t + DUREE_MINUTES <= limite; t += pas) resultat.push(enHeure(t));
  return resultat;
}

const seChevauchent = (aDebut: number, aFin: number, bDebut: number, bFin: number): boolean => aDebut < bFin && bDebut < aFin;

/**
 * Créneaux issus des règles, pour les jours de Paris compris entre `depuis` et `jusqua` (inclus).
 * Un créneau qui chevauche une absence de son accompagnant n'est pas généré.
 */
export function genererCreneaux(entree: {
  regles: readonly Regle[];
  absences: readonly Absence[];
  depuis: string;
  jusqua: string;
}): Creneau[] {
  const { regles, absences, depuis, jusqua } = entree;
  const parId = new Map<string, Creneau>();
  for (let jour = depuis; jour <= jusqua; jour = ajouterJours(jour, 1)) {
    const nom = jourDeLaSemaine(jour);
    for (const regle of regles) {
      if (regle.jour !== nom || jour < regle.valideDu || (regle.valideAu && jour > regle.valideAu)) continue;
      for (const heure of debutsDansPlage(regle.debut, regle.fin)) {
        const debut = instantParis(jour, heure);
        const fin = ajouterMinutes(debut, DUREE_MINUTES);
        const absent = absences.some(
          (a) =>
            a.accompagnantId === regle.accompagnantId &&
            seChevauchent(debut.getTime(), fin.getTime(), Date.parse(a.du), Date.parse(a.au)),
        );
        if (absent) continue;
        const id = identifiantCreneau(regle.accompagnantId, debut.toISOString());
        if (parId.has(id)) continue; // deux règles qui se recouvrent ne créent qu'un créneau
        parId.set(id, {
          id,
          accompagnantId: regle.accompagnantId,
          debut: debut.toISOString(),
          fin: fin.toISOString(),
          statut: 'libre',
          origine: 'regle',
          regleId: regle.id,
          reservationId: null,
        });
      }
    }
  }
  return [...parId.values()].sort((a, b) => a.debut.localeCompare(b.debut) || a.accompagnantId.localeCompare(b.accompagnantId));
}

/** Fenêtre de réservation d'un visiteur : de maintenant + 12 h jusqu'à trois semaines. */
export function fenetreReservation(maintenant: Date): { debut: Date; fin: Date } {
  return {
    debut: new Date(maintenant.getTime() + DELAI_MINIMUM_HEURES * 3_600_000),
    fin: new Date(maintenant.getTime() + HORIZON_JOURS * 86_400_000),
  };
}

export type CreneauPublic = { id: string; debut: string; fin: string; disponible: boolean; accompagnant: { prenom: string } };

/**
 * Ce que voit un visiteur. Les créneaux pris restent visibles, désactivés ; ceux que l'équipe a fermés
 * et ceux qui sortent de la fenêtre (trop proches, trop lointains, passés) ne sont pas montrés.
 */
export function creneauxPublics(
  creneaux: readonly Creneau[],
  prenoms: ReadonlyMap<string, string>,
  maintenant: Date,
): CreneauPublic[] {
  const { debut: plusTot, fin: plusTard } = fenetreReservation(maintenant);
  return creneaux
    .filter((c) => c.statut !== 'ferme')
    .filter((c) => Date.parse(c.debut) >= plusTot.getTime() && Date.parse(c.debut) <= plusTard.getTime())
    .map((c) => ({
      id: c.id,
      debut: c.debut,
      fin: c.fin,
      disponible: c.statut === 'libre',
      accompagnant: { prenom: prenoms.get(c.accompagnantId) ?? '' },
    }))
    .sort((a, b) => a.debut.localeCompare(b.debut));
}

/** Un visiteur peut-il réserver ce créneau maintenant ? Le serveur a toujours le dernier mot. */
export function reservable(c: Creneau, maintenant: Date): boolean {
  const { debut: plusTot, fin: plusTard } = fenetreReservation(maintenant);
  const t = Date.parse(c.debut);
  return c.statut === 'libre' && t >= plusTot.getTime() && t <= plusTard.getTime();
}

/** Places restantes dans le mois civil de Paris de `maintenant` : créneaux libres encore réservables. */
export function placesDuMois(creneaux: readonly Creneau[], maintenant: Date): number {
  const mois = dateParis(maintenant).slice(0, 7);
  return creneaux.filter((c) => reservable(c, maintenant) && dateParis(new Date(c.debut)).slice(0, 7) === mois).length;
}
