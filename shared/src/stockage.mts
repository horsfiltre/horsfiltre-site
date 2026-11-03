// Ce que le cœur de la réservation demande au stockage. DynamoDB l'implémentera avec des écritures
// conditionnelles et des transactions ; l'implémentation en mémoire ci-dessous sert aux tests.
import type { Canal, Recherche } from './constantes.mts';
import type { Absence, Creneau, Regle } from './creneaux.mts';

export type Reservation = {
  id: string;
  creneauId: string;
  accompagnantId: string;
  debut: string;
  fin: string;
  statut: 'confirmee' | 'annulee';
  prenom: string;
  email: string;
  empreinteEmail: string;
  recherche: Recherche;
  canal: Canal;
  whatsapp: string | null;
  motivation: string | null;
  fuseau: string;
  creeLe: string;
};

/** Un associé qui accompagne. Seuls les accompagnants actifs ont des créneaux. */
export type Accompagnant = { id: string; prenom: string; lienVisio: string; actif: boolean };

export type CodeErreur =
  | 'creneau_indisponible'
  | 'creneau_introuvable'
  | 'reservation_introuvable'
  | 'reservation_deja_annulee'
  | 'reservation_passee'
  | 'trop_de_reservations'
  | 'jeton_invalide'
  | 'jeton_expire';

export class ErreurMetier extends Error {
  readonly code: CodeErreur;
  constructor(code: CodeErreur) {
    super(code);
    this.name = 'ErreurMetier';
    this.code = code;
  }
}

export interface Stockage {
  /** Écrit les créneaux absents ; n'écrase jamais un créneau déjà réservé ou fermé. */
  ecrireCreneaux(creneaux: readonly Creneau[]): Promise<void>;
  lireCreneau(id: string): Promise<Creneau | undefined>;
  /** Créneaux dont le début est compris entre deux instants ISO, inclus. */
  listerCreneaux(depuis: string, jusqua: string): Promise<Creneau[]>;
  /** Atomique : échoue avec `creneau_indisponible` si le créneau n'est plus libre. */
  reserver(creneauId: string, reservation: Reservation): Promise<void>;
  lireReservation(id: string): Promise<Reservation | undefined>;
  compterReservationsActives(empreinteEmail: string): Promise<number>;
  /** Atomique : la réservation passe à « annulée » et son créneau redevient libre. */
  annuler(reservationId: string): Promise<Reservation>;
  /** Atomique : le nouveau créneau est pris et l'ancien libéré, ou rien ne change. */
  reporter(reservationId: string, nouveauCreneauId: string): Promise<Reservation>;
  changerStatutCreneau(id: string, statut: 'libre' | 'ferme'): Promise<Creneau>;

  // -------------------------------------------------------------------------------- administration

  listerAccompagnants(): Promise<Accompagnant[]>;
  lireAccompagnant(id: string): Promise<Accompagnant | undefined>;
  /** Crée ou remplace un accompagnant. */
  ecrireAccompagnant(accompagnant: Accompagnant): Promise<void>;

  listerRegles(accompagnantId: string): Promise<Regle[]>;
  lireRegle(id: string): Promise<Regle | undefined>;
  /** Crée ou remplace une règle (même identifiant, même accompagnant). */
  ecrireRegle(regle: Regle): Promise<void>;
  /** Faux si la règle n'existe pas. */
  supprimerRegle(id: string): Promise<boolean>;

  listerAbsences(accompagnantId: string): Promise<Absence[]>;
  lireAbsence(id: string): Promise<Absence | undefined>;
  ecrireAbsence(absence: Absence): Promise<void>;
  /** Faux si l'absence n'existe pas. */
  supprimerAbsence(id: string): Promise<boolean>;

  /**
   * Supprime un créneau qui n'est pas réservé. Atomique : un créneau réservé entre-temps n'est jamais supprimé.
   * Rend `absent` si le créneau n'existe pas, `reserve` s'il porte une réservation.
   */
  supprimerCreneau(id: string): Promise<'supprime' | 'absent' | 'reserve'>;

  /** Réservations (confirmées et annulées) dont le début est compris entre deux instants ISO, inclus. */
  listerReservations(depuis: string, jusqua: string): Promise<Reservation[]>;
}

export class StockageMemoire implements Stockage {
  readonly creneaux = new Map<string, Creneau>();
  readonly reservations = new Map<string, Reservation>();
  readonly accompagnants = new Map<string, Accompagnant>();
  readonly regles = new Map<string, Regle>();
  readonly absences = new Map<string, Absence>();

  async ecrireCreneaux(creneaux: readonly Creneau[]): Promise<void> {
    for (const c of creneaux) if (!this.creneaux.has(c.id)) this.creneaux.set(c.id, { ...c });
  }
  async lireCreneau(id: string): Promise<Creneau | undefined> {
    const c = this.creneaux.get(id);
    return c && { ...c };
  }
  async listerCreneaux(depuis: string, jusqua: string): Promise<Creneau[]> {
    return [...this.creneaux.values()].filter((c) => c.debut >= depuis && c.debut <= jusqua).map((c) => ({ ...c }));
  }
  async reserver(creneauId: string, reservation: Reservation): Promise<void> {
    const c = this.creneaux.get(creneauId);
    if (!c) throw new ErreurMetier('creneau_introuvable');
    if (c.statut !== 'libre') throw new ErreurMetier('creneau_indisponible');
    c.statut = 'reserve';
    c.reservationId = reservation.id;
    this.reservations.set(reservation.id, { ...reservation });
  }
  async lireReservation(id: string): Promise<Reservation | undefined> {
    const r = this.reservations.get(id);
    return r && { ...r };
  }
  async compterReservationsActives(empreinteEmail: string): Promise<number> {
    return [...this.reservations.values()].filter((r) => r.empreinteEmail === empreinteEmail && r.statut === 'confirmee').length;
  }
  async annuler(reservationId: string): Promise<Reservation> {
    const r = this.reservations.get(reservationId);
    if (!r) throw new ErreurMetier('reservation_introuvable');
    if (r.statut === 'annulee') throw new ErreurMetier('reservation_deja_annulee');
    r.statut = 'annulee';
    const c = this.creneaux.get(r.creneauId);
    if (c && c.reservationId === r.id) {
      c.statut = 'libre';
      c.reservationId = null;
    }
    return { ...r };
  }
  async reporter(reservationId: string, nouveauCreneauId: string): Promise<Reservation> {
    const r = this.reservations.get(reservationId);
    if (!r) throw new ErreurMetier('reservation_introuvable');
    if (r.statut === 'annulee') throw new ErreurMetier('reservation_deja_annulee');
    const nouveau = this.creneaux.get(nouveauCreneauId);
    if (!nouveau) throw new ErreurMetier('creneau_introuvable');
    if (nouveau.statut !== 'libre') throw new ErreurMetier('creneau_indisponible');
    const ancien = this.creneaux.get(r.creneauId);
    nouveau.statut = 'reserve';
    nouveau.reservationId = r.id;
    if (ancien && ancien.reservationId === r.id) {
      ancien.statut = 'libre';
      ancien.reservationId = null;
    }
    r.creneauId = nouveau.id;
    r.accompagnantId = nouveau.accompagnantId;
    r.debut = nouveau.debut;
    r.fin = nouveau.fin;
    return { ...r };
  }
  async changerStatutCreneau(id: string, statut: 'libre' | 'ferme'): Promise<Creneau> {
    const c = this.creneaux.get(id);
    if (!c) throw new ErreurMetier('creneau_introuvable');
    if (c.statut === 'reserve') throw new ErreurMetier('creneau_indisponible');
    c.statut = statut;
    return { ...c };
  }

  async listerAccompagnants(): Promise<Accompagnant[]> {
    return [...this.accompagnants.values()].map((a) => ({ ...a })).sort((a, b) => a.id.localeCompare(b.id));
  }
  async lireAccompagnant(id: string): Promise<Accompagnant | undefined> {
    const a = this.accompagnants.get(id);
    return a && { ...a };
  }
  async ecrireAccompagnant(a: Accompagnant): Promise<void> {
    this.accompagnants.set(a.id, { ...a });
  }

  async listerRegles(accompagnantId: string): Promise<Regle[]> {
    return [...this.regles.values()].filter((r) => r.accompagnantId === accompagnantId).map((r) => ({ ...r })).sort((a, b) => a.id.localeCompare(b.id));
  }
  async lireRegle(id: string): Promise<Regle | undefined> {
    const r = this.regles.get(id);
    return r && { ...r };
  }
  async ecrireRegle(r: Regle): Promise<void> {
    this.regles.set(r.id, { ...r, valideAu: r.valideAu ?? null });
  }
  async supprimerRegle(id: string): Promise<boolean> {
    return this.regles.delete(id);
  }

  async listerAbsences(accompagnantId: string): Promise<Absence[]> {
    return [...this.absences.values()].filter((a) => a.accompagnantId === accompagnantId).map((a) => ({ ...a })).sort((a, b) => a.du.localeCompare(b.du) || a.id.localeCompare(b.id));
  }
  async lireAbsence(id: string): Promise<Absence | undefined> {
    const a = this.absences.get(id);
    return a && { ...a };
  }
  async ecrireAbsence(a: Absence): Promise<void> {
    this.absences.set(a.id, { ...a });
  }
  async supprimerAbsence(id: string): Promise<boolean> {
    return this.absences.delete(id);
  }

  async supprimerCreneau(id: string): Promise<'supprime' | 'absent' | 'reserve'> {
    const c = this.creneaux.get(id);
    if (!c) return 'absent';
    if (c.statut === 'reserve') return 'reserve';
    this.creneaux.delete(id);
    return 'supprime';
  }

  async listerReservations(depuis: string, jusqua: string): Promise<Reservation[]> {
    return [...this.reservations.values()].filter((r) => r.debut >= depuis && r.debut <= jusqua).map((r) => ({ ...r })).sort((a, b) => a.debut.localeCompare(b.debut) || a.id.localeCompare(b.id));
  }
}
