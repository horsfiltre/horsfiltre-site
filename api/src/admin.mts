// Les routes d'administration : accompagnants, règles de disponibilité, absences, créneaux, réservations.
// Contrat : docs/api/reservations.openapi.yaml (tag « Administration »). Le contrôle d'accès (une identité vérifiée,
// membre du groupe `administrateurs`) est fait par le gestionnaire (http.mts), avant l'appel de ces routes.
import {
  DUREE_MINUTES,
  ErreurMetier,
  PAUSE_MINUTES,
  diagnostiquerConflits,
  identifiantCreneau,
  instantParis,
  nouvelIdentifiant,
  synchroniserCreneaux,
  type Absence,
  type Accompagnant,
  type Creneau,
  type Regle,
  type Reservation,
} from '../../shared/src/index.mts';
import { FORMAT_LIEN_MEET } from './amorcage.mts';
import { ENTETES_COMMUNS, FORMAT_DATE, ID, depuisErreurMetier, json, lireJson, prevenir, probleme, type Contexte, type Reponse, type Requete, type Route } from './commun.mts';

const ACC = '([a-z][a-z0-9-]{1,19})';
const FORMAT_ACCOMPAGNANT = /^[a-z][a-z0-9-]{1,19}$/;
const FORMAT_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const FORMAT_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const JOURS_CONTRAT = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
const PERIODE_MAX_JOURS = 92;
const MOTIF_MAX = 200;
const MESSAGE_MAX = 1000;

// ------------------------------------------------------------------------------------------------ aides

const objet = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function dateReelle(v: unknown): string | undefined {
  if (typeof v !== 'string' || !FORMAT_DATE.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined;
}

/** Instant ISO 8601 avec son fuseau explicite, normalisé en UTC. Sans fuseau, la date serait ambiguë : refusée. */
function instantIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || v.length > 40 || !FORMAT_INSTANT.test(v)) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

const enMinutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const donneesInvalides = (erreurs: Record<string, string>): Reponse => probleme(422, 'donnees_invalides', 'Certaines informations sont à corriger.', { erreurs });
const introuvable = (): Reponse => probleme(404, 'ressource_introuvable', 'Ressource introuvable.');
const sansContenu = (): Reponse => ({ statut: 204, entetes: { ...ENTETES_COMMUNS }, corps: '' });

/** Trace de ce que fait chaque membre de l'équipe : l'identifiant de l'acteur est opaque, aucune donnée personnelle n'y figure. */
function auditer(c: Contexte, action: string, cible?: string): void {
  c.deps.journal?.({ niveau: 'info', evenement: 'admin_action', action, acteur: c.req.identite?.sub, cible });
}

function lirePeriode(req: Requete): { ok: true; depuis: string; jusqua: string } | { ok: false; reponse: Reponse } {
  const du = dateReelle(req.requete.du);
  const au = dateReelle(req.requete.au);
  const refus = (titre: string) => ({ ok: false as const, reponse: probleme(400, 'parametre_invalide', titre) });
  if (!du || !au) return refus('Les paramètres du et au sont obligatoires, au format AAAA-MM-JJ.');
  if (au < du) return refus('La date de fin précède la date de début.');
  if ((Date.parse(`${au}T00:00:00Z`) - Date.parse(`${du}T00:00:00Z`)) / 86_400_000 > PERIODE_MAX_JOURS) return refus(`La période ne peut pas dépasser ${PERIODE_MAX_JOURS} jours.`);
  return { ok: true, depuis: instantParis(du, '00:00').toISOString(), jusqua: instantParis(au, '23:59').toISOString() };
}

// ------------------------------------------------------------------------------------------------ vues (formes du contrat)

const vueAccompagnant = (a: Accompagnant) => ({ id: a.id, prenom: a.prenom, lienVisio: a.lienVisio });

const vueRegle = (r: Regle) => ({
  id: r.id, accompagnantId: r.accompagnantId, jour: r.jour, debut: r.debut, fin: r.fin, valideDu: r.valideDu, valideAu: r.valideAu ?? null,
  dureeMinutes: DUREE_MINUTES, pauseMinutes: PAUSE_MINUTES,
});

const vueAbsence = (a: Absence) => ({ id: a.id, accompagnantId: a.accompagnantId, du: a.du, au: a.au, motif: a.motif ?? null });

/** Un créneau libre ou fermé dont l'heure est passée est « passé » ; un créneau réservé reste « reserve ». */
const vueCreneau = (c: Creneau, maintenant: Date) => ({
  id: c.id, debut: c.debut, fin: c.fin, statut: c.statut !== 'reserve' && Date.parse(c.fin) <= maintenant.getTime() ? 'passe' : c.statut,
  accompagnantId: c.accompagnantId, origine: c.origine, regleId: c.regleId ?? null, reservationId: c.reservationId ?? null,
});

const vueReservation = (r: Reservation, maintenant: Date) => ({
  id: r.id, debut: r.debut, fin: r.fin, canal: r.canal, statut: r.statut === 'confirmee' && Date.parse(r.fin) <= maintenant.getTime() ? 'passee' : r.statut,
  accompagnantId: r.accompagnantId, prenom: r.prenom, email: r.email, whatsapp: r.whatsapp, recherche: r.recherche, motivation: r.motivation, creeLe: r.creeLe,
});

// ------------------------------------------------------------------------------------------------ validation

type Validation<T> = { ok: true; valeur: T } | { ok: false; erreurs: Record<string, string> };

function validerRegle(entree: unknown): Validation<Omit<Regle, 'id'>> {
  const e = objet(entree);
  const erreurs: Record<string, string> = {};
  const accompagnantId = typeof e.accompagnantId === 'string' && FORMAT_ACCOMPAGNANT.test(e.accompagnantId) ? e.accompagnantId : undefined;
  if (!accompagnantId) erreurs.accompagnantId = 'Choisissez un accompagnant.';
  const jour = JOURS_CONTRAT.find((j) => j === e.jour);
  if (!jour) erreurs.jour = 'Choisissez un jour de la semaine.';
  const debut = typeof e.debut === 'string' && FORMAT_HEURE.test(e.debut) ? e.debut : undefined;
  const fin = typeof e.fin === 'string' && FORMAT_HEURE.test(e.fin) ? e.fin : undefined;
  if (!debut) erreurs.debut = 'Indiquez une heure au format HH:MM, par exemple 18:00.';
  if (!fin) erreurs.fin = 'Indiquez une heure au format HH:MM, par exemple 21:00.';
  if (debut && fin && enMinutes(fin) - enMinutes(debut) < DUREE_MINUTES) erreurs.fin = `La plage doit durer au moins ${DUREE_MINUTES} minutes, et finir après son début.`;
  const valideDu = dateReelle(e.valideDu);
  if (!valideDu) erreurs.valideDu = 'Indiquez une date au format AAAA-MM-JJ.';
  let valideAu: string | null = null;
  if (e.valideAu !== undefined && e.valideAu !== null) {
    const au = dateReelle(e.valideAu);
    if (!au) erreurs.valideAu = 'Indiquez une date au format AAAA-MM-JJ, ou laissez vide.';
    else if (valideDu && au < valideDu) erreurs.valideAu = 'La date de fin ne peut pas précéder la date de début.';
    else valideAu = au;
  }
  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  return { ok: true, valeur: { accompagnantId: accompagnantId!, jour: jour!, debut: debut!, fin: fin!, valideDu: valideDu!, valideAu } };
}

function validerAbsence(entree: unknown): Validation<Omit<Absence, 'id'>> {
  const e = objet(entree);
  const erreurs: Record<string, string> = {};
  const accompagnantId = typeof e.accompagnantId === 'string' && FORMAT_ACCOMPAGNANT.test(e.accompagnantId) ? e.accompagnantId : undefined;
  if (!accompagnantId) erreurs.accompagnantId = 'Choisissez un accompagnant.';
  const du = instantIso(e.du);
  const au = instantIso(e.au);
  if (!du) erreurs.du = 'Indiquez un instant avec son fuseau, par exemple 2026-12-01T00:00:00+01:00.';
  if (!au) erreurs.au = 'Indiquez un instant avec son fuseau, par exemple 2026-12-05T00:00:00+01:00.';
  if (du && au && Date.parse(au) <= Date.parse(du)) erreurs.au = 'La fin doit suivre le début.';
  else if (du && au && (Date.parse(au) - Date.parse(du)) / 86_400_000 > 366) erreurs.au = 'Une absence ne peut pas dépasser un an.';
  let motif: string | null = null;
  if (e.motif !== undefined && e.motif !== null) {
    if (typeof e.motif !== 'string' || e.motif.trim().length > MOTIF_MAX) erreurs.motif = `Le motif ne peut pas dépasser ${MOTIF_MAX} caractères.`;
    else motif = e.motif.trim() || null;
  }
  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  return { ok: true, valeur: { accompagnantId: accompagnantId!, du: du!, au: au!, motif } };
}

// ------------------------------------------------------------------------------------------------ routes

const route = (methode: string, motif: RegExp, nom: string, traiter: Route['traiter']): Route => ({ methode, motif, nom, admin: true, traiter });
const chemin = (fin: string): RegExp => new RegExp(`^/v1/admin/${fin}$`);

export const ROUTES_ADMIN: Route[] = [
  // ---------------------------------------------------------------------------------------- accompagnants
  route('GET', chemin('accompagnants'), 'admin_accompagnants', async ({ deps }) =>
    json(200, (await deps.stockage.listerAccompagnants()).map(vueAccompagnant))),

  route('PATCH', chemin(`accompagnants/${ACC}`), 'admin_modifier_accompagnant', async (c) => {
    const existant = await c.deps.stockage.lireAccompagnant(c.parametres[0]!);
    if (!existant) return introuvable();
    const corps = lireJson(c.req);
    if (!corps.ok) return corps.reponse;
    const lien = objet(corps.valeur).lienVisio;
    if (lien !== undefined && (typeof lien !== 'string' || !FORMAT_LIEN_MEET.test(lien))) {
      return donneesInvalides({ lienVisio: 'Indiquez un lien Google Meet de la forme https://meet.google.com/xxx-xxxx-xxx.' });
    }
    const modifie: Accompagnant = { ...existant, ...(typeof lien === 'string' ? { lienVisio: lien } : {}) };
    if (modifie.lienVisio !== existant.lienVisio) await c.deps.stockage.ecrireAccompagnant(modifie);
    auditer(c, 'accompagnant_modifie', existant.id); // le lien lui-même n'est jamais journalisé
    return json(200, vueAccompagnant(modifie));
  }),

  // ---------------------------------------------------------------------------------------- règles
  route('GET', chemin('regles'), 'admin_regles', async ({ deps, req }) => {
    const filtre = req.requete.accompagnantId;
    const ids = filtre ? [filtre] : (await deps.stockage.listerAccompagnants()).map((a) => a.id);
    const regles = (await Promise.all(ids.map((id) => deps.stockage.listerRegles(id)))).flat();
    const ordreJour = (j: string) => JOURS_CONTRAT.indexOf(j as (typeof JOURS_CONTRAT)[number]);
    regles.sort((a, b) => a.accompagnantId.localeCompare(b.accompagnantId) || ordreJour(a.jour) - ordreJour(b.jour) || a.debut.localeCompare(b.debut));
    return json(200, regles.map(vueRegle));
  }),

  route('POST', chemin('regles'), 'admin_creer_regle', async (c) => {
    const corps = lireJson(c.req);
    if (!corps.ok) return corps.reponse;
    const v = validerRegle(corps.valeur);
    if (!v.ok) return donneesInvalides(v.erreurs);
    if (!(await c.deps.stockage.lireAccompagnant(v.valeur.accompagnantId))) return donneesInvalides({ accompagnantId: "Cet accompagnant n'existe pas." });
    const regle: Regle = { id: nouvelIdentifiant(), ...v.valeur };
    await c.deps.stockage.ecrireRegle(regle);
    await synchroniserCreneaux(c.deps.stockage, c.maintenant);
    auditer(c, 'regle_creee', regle.id);
    return json(201, vueRegle(regle));
  }),

  route('PUT', chemin(`regles/${ID}`), 'admin_remplacer_regle', async (c) => {
    const existante = await c.deps.stockage.lireRegle(c.parametres[0]!);
    if (!existante) return introuvable();
    const corps = lireJson(c.req);
    if (!corps.ok) return corps.reponse;
    const v = validerRegle(corps.valeur);
    if (!v.ok) return donneesInvalides(v.erreurs);
    if (v.valeur.accompagnantId !== existante.accompagnantId) {
      return donneesInvalides({ accompagnantId: "L'accompagnant d'une règle ne se change pas : supprimez la règle et recréez-la." });
    }
    const regle: Regle = { id: existante.id, ...v.valeur };
    await c.deps.stockage.ecrireRegle(regle);
    await synchroniserCreneaux(c.deps.stockage, c.maintenant);
    auditer(c, 'regle_remplacee', regle.id);
    return json(200, vueRegle(regle));
  }),

  route('DELETE', chemin(`regles/${ID}`), 'admin_supprimer_regle', async (c) => {
    if (!(await c.deps.stockage.supprimerRegle(c.parametres[0]!))) return introuvable();
    await synchroniserCreneaux(c.deps.stockage, c.maintenant);
    auditer(c, 'regle_supprimee', c.parametres[0]);
    return sansContenu();
  }),

  // ---------------------------------------------------------------------------------------- absences
  route('GET', chemin('absences'), 'admin_absences', async ({ deps, req }) => {
    const filtre = req.requete.accompagnantId;
    const ids = filtre ? [filtre] : (await deps.stockage.listerAccompagnants()).map((a) => a.id);
    const absences = (await Promise.all(ids.map((id) => deps.stockage.listerAbsences(id)))).flat();
    absences.sort((a, b) => a.du.localeCompare(b.du) || a.id.localeCompare(b.id));
    return json(200, absences.map(vueAbsence));
  }),

  route('POST', chemin('absences'), 'admin_creer_absence', async (c) => {
    const corps = lireJson(c.req);
    if (!corps.ok) return corps.reponse;
    const v = validerAbsence(corps.valeur);
    if (!v.ok) return donneesInvalides(v.erreurs);
    if (!(await c.deps.stockage.lireAccompagnant(v.valeur.accompagnantId))) return donneesInvalides({ accompagnantId: "Cet accompagnant n'existe pas." });
    const absence: Absence = { id: nouvelIdentifiant(), ...v.valeur };
    await c.deps.stockage.ecrireAbsence(absence);
    const bilan = await synchroniserCreneaux(c.deps.stockage, c.maintenant);
    // Les rendez-vous déjà pris pendant l'absence ne sont jamais supprimés : on les rend à l'équipe, qui décide.
    const concernes: Reservation[] = [];
    for (const creneau of bilan.conflits) {
      if (creneau.accompagnantId !== absence.accompagnantId || !creneau.reservationId) continue;
      if (!(Date.parse(creneau.debut) < Date.parse(absence.au) && Date.parse(absence.du) < Date.parse(creneau.fin))) continue;
      const r = await c.deps.stockage.lireReservation(creneau.reservationId);
      if (r && r.statut === 'confirmee') concernes.push(r);
    }
    auditer(c, 'absence_creee', absence.id);
    return json(201, { absence: vueAbsence(absence), reservationsConcernees: concernes.map((r) => vueReservation(r, c.maintenant)) });
  }),

  route('DELETE', chemin(`absences/${ID}`), 'admin_supprimer_absence', async (c) => {
    if (!(await c.deps.stockage.supprimerAbsence(c.parametres[0]!))) return introuvable();
    await synchroniserCreneaux(c.deps.stockage, c.maintenant);
    auditer(c, 'absence_supprimee', c.parametres[0]);
    return sansContenu();
  }),

  // ---------------------------------------------------------------------------------------- créneaux
  route('GET', chemin('creneaux'), 'admin_creneaux', async ({ deps, req, maintenant }) => {
    const periode = lirePeriode(req);
    if (!periode.ok) return periode.reponse;
    const creneaux = await deps.stockage.listerCreneaux(periode.depuis, periode.jusqua);
    creneaux.sort((a, b) => a.debut.localeCompare(b.debut) || a.accompagnantId.localeCompare(b.accompagnantId));
    return json(200, creneaux.map((x) => vueCreneau(x, maintenant)));
  }),

  route('POST', chemin('creneaux'), 'admin_creer_creneau', async (c) => {
    const corps = lireJson(c.req);
    if (!corps.ok) return corps.reponse;
    const b = objet(corps.valeur);
    const erreurs: Record<string, string> = {};
    const accompagnantId = typeof b.accompagnantId === 'string' && FORMAT_ACCOMPAGNANT.test(b.accompagnantId) ? b.accompagnantId : undefined;
    if (!accompagnantId) erreurs.accompagnantId = 'Choisissez un accompagnant.';
    const debut = instantIso(b.debut);
    if (!debut) erreurs.debut = 'Indiquez un instant avec son fuseau, par exemple 2026-12-01T18:00:00+01:00.';
    else if (Date.parse(debut) <= c.maintenant.getTime()) erreurs.debut = 'Le créneau doit être dans le futur.';
    if (Object.keys(erreurs).length) return donneesInvalides(erreurs);
    if (!(await c.deps.stockage.lireAccompagnant(accompagnantId!))) return donneesInvalides({ accompagnantId: "Cet accompagnant n'existe pas." });

    const fin = new Date(Date.parse(debut!) + DUREE_MINUTES * 60_000).toISOString();
    // Même règle que pour les créneaux issus des règles : une pause sépare deux échanges d'un même accompagnant.
    const marge = PAUSE_MINUTES * 60_000;
    const voisins = await c.deps.stockage.listerCreneaux(new Date(Date.parse(debut!) - 4 * 3_600_000).toISOString(), new Date(Date.parse(debut!) + 4 * 3_600_000).toISOString());
    const gene = voisins.some((x) => x.accompagnantId === accompagnantId && Date.parse(debut!) < Date.parse(x.fin) + marge && Date.parse(x.debut) < Date.parse(fin) + marge);
    if (gene) {
      return probleme(409, 'creneau_chevauche', `Ce créneau chevauche un créneau existant de cet accompagnant (une pause de ${PAUSE_MINUTES} minutes sépare deux échanges).`);
    }
    const creneau: Creneau = { id: identifiantCreneau(accompagnantId!, debut!), accompagnantId: accompagnantId!, debut: debut!, fin, statut: 'libre', origine: 'ponctuel', regleId: null, reservationId: null };
    await c.deps.stockage.ecrireCreneaux([creneau]);
    auditer(c, 'creneau_ponctuel_cree', creneau.id);
    return json(201, vueCreneau(creneau, c.maintenant));
  }),

  route('PATCH', chemin(`creneaux/${ID}`), 'admin_statut_creneau', async (c) => {
    const corps = lireJson(c.req);
    if (!corps.ok) return corps.reponse;
    const statut = objet(corps.valeur).statut;
    if (statut !== 'libre' && statut !== 'ferme') return donneesInvalides({ statut: 'Choisissez « libre » ou « ferme ».' });
    try {
      const creneau = await c.deps.stockage.changerStatutCreneau(c.parametres[0]!, statut);
      auditer(c, statut === 'ferme' ? 'creneau_ferme' : 'creneau_rouvert', creneau.id);
      return json(200, vueCreneau(creneau, c.maintenant));
    } catch (e) {
      if (e instanceof ErreurMetier && e.code === 'creneau_introuvable') return introuvable();
      if (e instanceof ErreurMetier && e.code === 'creneau_indisponible') return probleme(409, 'creneau_reserve', "Ce créneau est réservé : annulez d'abord la réservation.");
      throw e;
    }
  }),

  // ---------------------------------------------------------------------------------------- réservations
  route('GET', chemin('reservations'), 'admin_reservations', async (c) => {
    const periode = lirePeriode(c.req);
    if (!periode.ok) return periode.reponse;
    const reservations = await c.deps.stockage.listerReservations(periode.depuis, periode.jusqua);
    auditer(c, 'reservations_consultees'); // coordonnées de candidats : chaque lecture laisse une trace
    return json(200, reservations.map((r) => vueReservation(r, c.maintenant)));
  }),

  route('POST', chemin(`reservations/${ID}/annulation`), 'admin_annuler_reservation', async (c) => {
    const reservation = await c.deps.stockage.lireReservation(c.parametres[0]!);
    if (!reservation) return introuvable();
    const corps = lireJson(c.req);
    if (!corps.ok) return corps.reponse;
    const message = objet(corps.valeur).message;
    if (typeof message !== 'string' || !message.trim() || message.trim().length > MESSAGE_MAX) {
      return donneesInvalides({ message: `Écrivez un message pour la personne (${MESSAGE_MAX} caractères au plus).` });
    }
    try {
      const annulee = await c.deps.stockage.annuler(reservation.id);
      await prevenir(c.deps, c.deps.apresAnnulation && (() => c.deps.apresAnnulation!({ reservation: annulee, message: message.trim(), parAdministrateur: true })), 'annulation_administration');
      auditer(c, 'reservation_annulee_par_equipe', annulee.id);
      return json(200, vueReservation(annulee, c.maintenant));
    } catch (e) {
      if (e instanceof ErreurMetier) return depuisErreurMetier(e);
      throw e;
    }
  }),

  // ---------------------------------------------------------------------------------------- conflits (ajout au contrat)
  route('GET', chemin('conflits'), 'admin_conflits', async (c) => {
    const creneaux = await diagnostiquerConflits(c.deps.stockage, c.maintenant);
    const reservations: Reservation[] = [];
    for (const creneau of creneaux) {
      const r = creneau.reservationId ? await c.deps.stockage.lireReservation(creneau.reservationId) : undefined;
      if (r && r.statut === 'confirmee') reservations.push(r);
    }
    auditer(c, 'conflits_consultes');
    return json(200, reservations.map((r) => vueReservation(r, c.maintenant)));
  }),
];
