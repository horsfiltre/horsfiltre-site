import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifiantCreneau, nouvelIdentifiant } from '../src/identifiants.mts';
import { empreinteEmail } from '../src/reservation.mts';
import { StockageMemoire, type Reservation } from '../src/stockage.mts';
import { synchroniserCreneaux } from '../src/synchronisation.mts';
import type { Creneau, Regle } from '../src/creneaux.mts';

// Lundi 16 novembre 2026, 10 h à Paris : la fenêtre va jusqu'au 7 décembre.
const LUNDI = new Date('2026-11-16T09:00:00Z');
const mardi: Regle = { id: 'R-ILYAS', accompagnantId: 'ilyas', jour: 'mardi', debut: '18:00', fin: '21:00', valideDu: '2026-11-01', valideAu: null };
const jeudi: Regle = { id: 'R-SARAH', accompagnantId: 'sarah', jour: 'jeudi', debut: '10:00', fin: '12:00', valideDu: '2026-11-01', valideAu: null };

async function monde() {
  const stockage = new StockageMemoire();
  await stockage.ecrireAccompagnant({ id: 'ilyas', prenom: 'Ilyas', lienVisio: 'https://meet.google.com/ilyas', actif: true });
  await stockage.ecrireAccompagnant({ id: 'sarah', prenom: 'Sarah', lienVisio: 'https://meet.google.com/sarah', actif: true });
  await stockage.ecrireRegle(mardi);
  await stockage.ecrireRegle(jeudi);
  const reserver = async (c: Creneau, email = 'a@exemple.fr') => {
    const r: Reservation = { id: nouvelIdentifiant(), creneauId: c.id, accompagnantId: c.accompagnantId, debut: c.debut, fin: c.fin, statut: 'confirmee',
      prenom: 'Sarah', email, empreinteEmail: empreinteEmail(email), recherche: 'cdi', canal: 'visio', whatsapp: null, motivation: null, fuseau: 'Europe/Paris', creeLe: LUNDI.toISOString() };
    await stockage.reserver(c.id, r);
    return r;
  };
  const creneauxDe = (acc: string) => [...stockage.creneaux.values()].filter((c) => c.accompagnantId === acc).sort((a, b) => a.debut.localeCompare(b.debut));
  return { stockage, reserver, creneauxDe };
}

test('la première synchronisation crée les créneaux des trois semaines ; la seconde ne change rien', async () => {
  const { stockage } = await monde();
  const premiere = await synchroniserCreneaux(stockage, LUNDI);
  assert.deepEqual({ ajoutes: premiere.ajoutes, retires: premiere.retires, conflits: premiere.conflits.length }, { ajoutes: 21, retires: 0, conflits: 0 }); // 3 mardis × 4 + 3 jeudis × 3
  const seconde = await synchroniserCreneaux(stockage, LUNDI);
  assert.deepEqual({ ajoutes: seconde.ajoutes, retires: seconde.retires, conflits: seconde.conflits.length }, { ajoutes: 0, retires: 0, conflits: 0 });
  assert.equal(stockage.creneaux.size, 21);
});

test('la fenêtre est glissante : une semaine plus tard, la semaine nouvelle est ajoutée', async () => {
  const { stockage } = await monde();
  await synchroniserCreneaux(stockage, LUNDI);
  const plusTard = await synchroniserCreneaux(stockage, new Date(LUNDI.getTime() + 7 * 86_400_000));
  assert.equal(plusTard.ajoutes, 7); // mardi 8 décembre (4) et jeudi 10 décembre (3)
  assert.equal(plusTard.retires, 0);
});

test('une règle modifiée remplace les créneaux libres, mais ne supprime jamais un créneau réservé', async () => {
  const { stockage, reserver, creneauxDe } = await monde();
  await synchroniserCreneaux(stockage, LUNDI);
  const pris = creneauxDe('ilyas')[0]!; // mardi 17 novembre, 18 h
  const reservation = await reserver(pris);
  await stockage.ecrireRegle({ ...mardi, debut: '17:00', fin: '19:00' }); // plus aucun créneau commun avec l'ancienne règle
  const bilan = await synchroniserCreneaux(stockage, LUNDI);
  assert.equal(bilan.retires, 11);
  assert.equal(bilan.ajoutes, 9); // 17:00, 17:45 et 18:30 (qui finit à 19:00) sur 3 mardis
  assert.deepEqual(bilan.conflits.map((c) => c.id), [pris.id]);
  assert.equal((await stockage.lireCreneau(pris.id))!.statut, 'reserve');
  assert.equal((await stockage.lireReservation(reservation.id))!.statut, 'confirmee');
});

test('une absence retire les créneaux qu’elle couvre ; la supprimer les rétablit', async () => {
  const { stockage, creneauxDe } = await monde();
  await synchroniserCreneaux(stockage, LUNDI);
  await stockage.ecrireAbsence({ id: 'A1', accompagnantId: 'ilyas', du: '2026-11-24T00:00:00.000Z', au: '2026-11-25T00:00:00.000Z' });
  const avec = await synchroniserCreneaux(stockage, LUNDI);
  assert.equal(avec.retires, 4);
  assert.equal(creneauxDe('ilyas').length, 8);
  assert.equal(creneauxDe('sarah').length, 9); // l'absence d'Ilyas ne touche pas Sarah
  await stockage.supprimerAbsence('A1');
  const sans = await synchroniserCreneaux(stockage, LUNDI);
  assert.equal(sans.ajoutes, 4);
  assert.equal(creneauxDe('ilyas').length, 12);
});

test('un accompagnant désactivé n’a plus de créneaux libres ; ses créneaux réservés sont signalés', async () => {
  const { stockage, reserver, creneauxDe } = await monde();
  await synchroniserCreneaux(stockage, LUNDI);
  const pris = creneauxDe('sarah')[0]!;
  await reserver(pris);
  await stockage.ecrireAccompagnant({ id: 'sarah', prenom: 'Sarah', lienVisio: 'https://meet.google.com/sarah', actif: false });
  const bilan = await synchroniserCreneaux(stockage, LUNDI);
  assert.equal(bilan.retires, 8);
  assert.deepEqual(bilan.conflits.map((c) => c.id), [pris.id]);
  assert.equal(creneauxDe('sarah').length, 1);
});

test('un créneau ponctuel n’est jamais touché ; un créneau fermé reste fermé tant que la règle le produit', async () => {
  const { stockage, creneauxDe } = await monde();
  await synchroniserCreneaux(stockage, LUNDI);
  const debut = '2026-11-18T13:00:00.000Z';
  const ponctuel: Creneau = { id: identifiantCreneau('ilyas', debut), accompagnantId: 'ilyas', debut, fin: '2026-11-18T13:30:00.000Z', statut: 'libre', origine: 'ponctuel', regleId: null, reservationId: null };
  await stockage.ecrireCreneaux([ponctuel]);
  const ferme = creneauxDe('ilyas').find((c) => c.origine === 'regle')!;
  await stockage.changerStatutCreneau(ferme.id, 'ferme');
  const stable = await synchroniserCreneaux(stockage, LUNDI);
  assert.deepEqual({ ajoutes: stable.ajoutes, retires: stable.retires }, { ajoutes: 0, retires: 0 });
  assert.equal((await stockage.lireCreneau(ferme.id))!.statut, 'ferme');
  // La règle disparaît : le créneau fermé, devenu inutile, est supprimé ; le ponctuel reste.
  await stockage.supprimerRegle(mardi.id);
  const sans = await synchroniserCreneaux(stockage, LUNDI);
  assert.equal(sans.retires, 12);
  assert.equal(await stockage.lireCreneau(ferme.id), undefined);
  assert.ok(await stockage.lireCreneau(ponctuel.id));
});

test('un créneau réservé entre la lecture et la suppression est signalé, pas supprimé', async () => {
  const { stockage, creneauxDe } = await monde();
  await synchroniserCreneaux(stockage, LUNDI);
  const cible = creneauxDe('ilyas')[1]!;
  const original = stockage.supprimerCreneau.bind(stockage);
  stockage.supprimerCreneau = async (id: string) => (id === cible.id ? 'reserve' : original(id)); // une réservation arrive juste avant
  await stockage.supprimerRegle(mardi.id);
  const bilan = await synchroniserCreneaux(stockage, LUNDI);
  assert.deepEqual(bilan.conflits.map((c) => c.id), [cible.id]);
  assert.equal(bilan.retires, 11);
});

test('une règle qui commence plus tard ne produit rien avant sa date de début', async () => {
  const { stockage, creneauxDe } = await monde();
  await stockage.ecrireRegle({ ...mardi, valideDu: '2026-11-24' });
  await synchroniserCreneaux(stockage, LUNDI);
  assert.equal(creneauxDe('ilyas').length, 8); // seulement les mardis 24 novembre et 1er décembre
});
