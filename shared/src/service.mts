// Les trois gestes d'un visiteur : réserver, annuler, reporter. Le serveur vérifie tout, à chaque fois.
import { creerJeton, empreinteEmail, verifierJeton, type DemandeValidee } from './reservation.mts';
import { MAX_RESERVATIONS_ACTIVES_PAR_EMAIL } from './constantes.mts';
import { reservable } from './creneaux.mts';
import { nouvelIdentifiant } from './identifiants.mts';
import { ErreurMetier, type Reservation, type Stockage } from './stockage.mts';

export type Dependances = {
  stockage: Stockage;
  maintenant: () => Date;
  /** Secret de signature des liens, lu au démarrage dans le magasin de paramètres. */
  secretJeton: string;
};

export async function reserverCreneau(
  deps: Dependances,
  demande: DemandeValidee,
): Promise<{ reservation: Reservation; jeton: string }> {
  const maintenant = deps.maintenant();
  const creneau = await deps.stockage.lireCreneau(demande.creneauId);
  if (!creneau) throw new ErreurMetier('creneau_introuvable');
  if (!reservable(creneau, maintenant)) throw new ErreurMetier('creneau_indisponible');

  const empreinte = empreinteEmail(demande.email);
  if ((await deps.stockage.compterReservationsActives(empreinte)) >= MAX_RESERVATIONS_ACTIVES_PAR_EMAIL)
    throw new ErreurMetier('trop_de_reservations');

  const reservation: Reservation = {
    id: nouvelIdentifiant(),
    creneauId: creneau.id,
    accompagnantId: creneau.accompagnantId,
    debut: creneau.debut,
    fin: creneau.fin,
    statut: 'confirmee',
    prenom: demande.prenom,
    email: demande.email,
    empreinteEmail: empreinte,
    recherche: demande.recherche,
    canal: demande.canal,
    whatsapp: demande.whatsapp,
    motivation: demande.motivation,
    fuseau: demande.fuseau,
    creeLe: maintenant.toISOString(),
  };
  // La lecture ci-dessus peut être périmée : c'est cette écriture conditionnelle qui décide.
  await deps.stockage.reserver(creneau.id, reservation);
  return { reservation, jeton: creerJeton(deps.secretJeton, reservation.id, new Date(creneau.debut)) };
}

async function reservationDuJeton(deps: Dependances, jeton: string): Promise<Reservation> {
  const v = verifierJeton(deps.secretJeton, jeton, deps.maintenant());
  if (!v.ok) throw new ErreurMetier(v.raison === 'expire' ? 'jeton_expire' : 'jeton_invalide');
  const r = await deps.stockage.lireReservation(v.reservationId);
  if (!r) throw new ErreurMetier('reservation_introuvable');
  return r;
}

export async function consulterReservation(deps: Dependances, jeton: string): Promise<Reservation> {
  return reservationDuJeton(deps, jeton);
}

export async function annulerReservation(deps: Dependances, jeton: string): Promise<Reservation> {
  const r = await reservationDuJeton(deps, jeton);
  if (r.statut === 'annulee') throw new ErreurMetier('reservation_deja_annulee');
  if (Date.parse(r.debut) <= deps.maintenant().getTime()) throw new ErreurMetier('reservation_passee');
  return deps.stockage.annuler(r.id);
}

export async function reporterReservation(deps: Dependances, jeton: string, nouveauCreneauId: string): Promise<Reservation> {
  const r = await reservationDuJeton(deps, jeton);
  if (r.statut === 'annulee') throw new ErreurMetier('reservation_deja_annulee');
  if (Date.parse(r.debut) <= deps.maintenant().getTime()) throw new ErreurMetier('reservation_passee');
  const nouveau = await deps.stockage.lireCreneau(nouveauCreneauId);
  if (!nouveau) throw new ErreurMetier('creneau_introuvable');
  if (!reservable(nouveau, deps.maintenant())) throw new ErreurMetier('creneau_indisponible');
  return deps.stockage.reporter(r.id, nouveau.id);
}

/** Annulation par un administrateur : pas de jeton, l'identité vient de l'authentification de l'administration. */
export async function annulerParAdministrateur(deps: Dependances, reservationId: string): Promise<Reservation> {
  return deps.stockage.annuler(reservationId);
}
