import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genererCreneaux, type Regle } from '../src/creneaux.mts';
import { validerDemande } from '../src/reservation.mts';
import { annulerParAdministrateur, annulerReservation, consulterReservation, reporterReservation, reserverCreneau, type Dependances } from '../src/service.mts';
import { ErreurMetier, StockageMemoire } from '../src/stockage.mts';

// Lundi 16 novembre 2026, 10 h à Paris.
const LUNDI = new Date('2026-11-16T09:00:00Z');
const regle: Regle = { id: 'R1', accompagnantId: 'ilyas', jour: 'mardi', debut: '18:00', fin: '21:00', valideDu: '2026-11-01' };

async function monde() {
  const stockage = new StockageMemoire();
  const creneaux = genererCreneaux({ regles: [regle], absences: [], depuis: '2026-11-16', jusqua: '2026-12-08' });
  await stockage.ecrireCreneaux(creneaux);
  let maintenant = LUNDI;
  const deps: Dependances = { stockage, maintenant: () => maintenant, secretJeton: 'secret-de-test-assez-long' };
  return { stockage, creneaux, deps, avancerA: (d: Date) => { maintenant = d; } };
}

const demande = (creneauId: string, email = 'sarah@exemple.fr') => {
  const r = validerDemande({ creneauId, prenom: 'Sarah', email, recherche: 'alternance', canal: 'visio', turnstile: 'ok' });
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.valeur;
};
const code = async (p: Promise<unknown>) => { try { await p; return 'aucune erreur'; } catch (e) { return e instanceof ErreurMetier ? e.code : String(e); } };

test('réserver prend le créneau et donne un lien d’annulation valide', async () => {
  const { deps, stockage, creneaux } = await monde();
  const cible = creneaux.find((c) => c.debut === '2026-11-17T17:00:00.000Z')!; // mardi 18 h : dans 32 h
  const { reservation, jeton } = await reserverCreneau(deps, demande(cible.id));
  assert.equal(reservation.statut, 'confirmee');
  assert.equal((await stockage.lireCreneau(cible.id))!.statut, 'reserve');
  assert.equal((await consulterReservation(deps, jeton)).id, reservation.id);
});

test('deux personnes qui réservent le même créneau en même temps : une seule l’obtient', async () => {
  const { deps, stockage, creneaux } = await monde();
  const cible = creneaux[1]!;
  const resultats = await Promise.allSettled([
    reserverCreneau(deps, demande(cible.id, 'a@exemple.fr')),
    reserverCreneau(deps, demande(cible.id, 'b@exemple.fr')),
  ]);
  assert.equal(resultats.filter((r) => r.status === 'fulfilled').length, 1);
  const refus = resultats.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal((refus.reason as ErreurMetier).code, 'creneau_indisponible');
  assert.equal([...stockage.reservations.values()].length, 1);
});

test('un créneau trop proche, inconnu ou fermé ne peut pas être réservé', async () => {
  const { deps, stockage, creneaux } = await monde();
  const tropProche = creneaux.find((c) => c.debut === '2026-11-17T17:00:00.000Z')!;
  const [premier, second] = creneaux.filter((c) => c.debut > '2026-11-17T20:00:00.000Z') as [typeof creneaux[number], typeof creneaux[number]];
  assert.equal(await code(reserverCreneau({ ...deps, maintenant: () => new Date('2026-11-17T08:00:00Z') }, demande(tropProche.id))), 'creneau_indisponible');
  assert.equal(await code(reserverCreneau(deps, demande('0'.repeat(26)))), 'creneau_introuvable');
  await stockage.changerStatutCreneau(premier.id, 'ferme');
  assert.equal(await code(reserverCreneau(deps, demande(premier.id))), 'creneau_indisponible');
  assert.equal(await code(reserverCreneau(deps, demande(second.id))), 'aucune erreur');
});

test('une adresse e-mail n’a qu’une réservation active à la fois', async () => {
  const { deps, creneaux } = await monde();
  const [a, b] = [creneaux[4]!, creneaux[5]!];
  const { jeton } = await reserverCreneau(deps, demande(a.id));
  assert.equal(await code(reserverCreneau(deps, demande(b.id))), 'trop_de_reservations');
  assert.equal(await code(reserverCreneau(deps, demande(b.id, 'SARAH@exemple.fr '.trim()))), 'trop_de_reservations'); // la casse ne contourne rien
  await annulerReservation(deps, jeton);
  assert.equal(await code(reserverCreneau(deps, demande(b.id))), 'aucune erreur');
});

test('annuler libère le créneau ; annuler deux fois, ou avec un faux lien, est refusé', async () => {
  const { deps, stockage, creneaux } = await monde();
  const cible = creneaux[3]!;
  const { jeton } = await reserverCreneau(deps, demande(cible.id));
  await annulerReservation(deps, jeton);
  assert.equal((await stockage.lireCreneau(cible.id))!.statut, 'libre');
  assert.equal(await code(annulerReservation(deps, jeton)), 'reservation_deja_annulee');
  assert.equal(await code(annulerReservation(deps, jeton + 'x')), 'jeton_invalide');
});

test('on ne peut plus annuler ni reporter un échange commencé', async () => {
  const { deps, creneaux, avancerA } = await monde();
  const cible = creneaux[3]!;
  const { jeton } = await reserverCreneau(deps, demande(cible.id));
  avancerA(new Date(Date.parse(cible.debut) + 3_600_000)); // une heure après le début : le lien vit encore
  assert.equal(await code(annulerReservation(deps, jeton)), 'reservation_passee');
  assert.equal(await code(reporterReservation(deps, jeton, creneaux[8]!.id)), 'reservation_passee');
  avancerA(new Date(Date.parse(cible.debut) + 25 * 3_600_000)); // le lien a expiré
  assert.equal(await code(annulerReservation(deps, jeton)), 'jeton_expire');
});

test('reporter prend le nouveau créneau et libère l’ancien, ou ne change rien', async () => {
  const { deps, stockage, creneaux } = await monde();
  const [ancien, libre, pris] = [creneaux[4]!, creneaux[5]!, creneaux[6]!];
  const { jeton } = await reserverCreneau(deps, demande(ancien.id));
  await reserverCreneau(deps, demande(pris.id, 'autre@exemple.fr'));

  assert.equal(await code(reporterReservation(deps, jeton, pris.id)), 'creneau_indisponible');
  assert.equal((await stockage.lireCreneau(ancien.id))!.statut, 'reserve'); // rien n'a changé

  const r = await reporterReservation(deps, jeton, libre.id);
  assert.equal(r.creneauId, libre.id);
  assert.equal((await stockage.lireCreneau(ancien.id))!.statut, 'libre');
  assert.equal((await stockage.lireCreneau(libre.id))!.statut, 'reserve');
});

test('l’administration peut annuler une réservation sans lien', async () => {
  const { deps, stockage, creneaux } = await monde();
  const { reservation } = await reserverCreneau(deps, demande(creneaux[3]!.id));
  await annulerParAdministrateur(deps, reservation.id);
  assert.equal((await stockage.lireCreneau(creneaux[3]!.id))!.statut, 'libre');
  assert.equal(await code(annulerParAdministrateur(deps, 'Z'.repeat(26))), 'reservation_introuvable');
});

test('régénérer les créneaux n’efface jamais une réservation ni une fermeture', async () => {
  const { deps, stockage, creneaux } = await monde();
  const [pris, ferme] = [creneaux[3]!, creneaux[4]!];
  await reserverCreneau(deps, demande(pris.id));
  await stockage.changerStatutCreneau(ferme.id, 'ferme');
  await stockage.ecrireCreneaux(genererCreneaux({ regles: [regle], absences: [], depuis: '2026-11-16', jusqua: '2026-12-08' }));
  assert.equal((await stockage.lireCreneau(pris.id))!.statut, 'reserve');
  assert.equal((await stockage.lireCreneau(ferme.id))!.statut, 'ferme');
});

test('on ne ferme pas un créneau réservé : il faut d’abord annuler la réservation', async () => {
  const { deps, stockage, creneaux } = await monde();
  await reserverCreneau(deps, demande(creneaux[3]!.id));
  assert.equal(await code(stockage.changerStatutCreneau(creneaux[3]!.id, 'ferme')), 'creneau_indisponible');
});
