import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  creneauxPublics,
  debutsDansPlage,
  genererCreneaux,
  placesDuMois,
  reservable,
  type Absence,
  type Creneau,
  type Regle,
} from '../src/creneaux.mts';
import { FORMAT_IDENTIFIANT, identifiantCreneau } from '../src/identifiants.mts';

const mardiSoir = (extra: Partial<Regle> = {}): Regle => ({
  id: 'R1', accompagnantId: 'ilyas', jour: 'mardi', debut: '18:00', fin: '21:00', valideDu: '2026-11-01', valideAu: null, ...extra,
});

test('un échange de 30 minutes, puis 15 minutes de pause', () => {
  assert.deepEqual(debutsDansPlage('18:00', '21:00'), ['18:00', '18:45', '19:30', '20:15']);
  assert.deepEqual(debutsDansPlage('10:00', '12:00'), ['10:00', '10:45', '11:30']);
  assert.deepEqual(debutsDansPlage('10:00', '10:20'), []);
});

test('une règle hebdomadaire génère les créneaux du bon jour, à l’heure de Paris', () => {
  const c = genererCreneaux({ regles: [mardiSoir()], absences: [], depuis: '2026-11-16', jusqua: '2026-11-22' });
  assert.equal(c.length, 4);
  assert.equal(c[0]!.debut, '2026-11-17T17:00:00.000Z'); // 18 h à Paris, heure d'hiver
  assert.equal(c[0]!.fin, '2026-11-17T17:30:00.000Z');
  assert.equal(c[3]!.debut, '2026-11-17T19:15:00.000Z');
  assert.ok(c.every((x) => x.statut === 'libre' && x.origine === 'regle'));
});

test('une règle ne s’applique pas avant sa date de début ni après sa date de fin', () => {
  const avant = genererCreneaux({ regles: [mardiSoir({ valideDu: '2026-11-24' })], absences: [], depuis: '2026-11-16', jusqua: '2026-11-22' });
  assert.equal(avant.length, 0);
  const apres = genererCreneaux({ regles: [mardiSoir({ valideAu: '2026-11-16' })], absences: [], depuis: '2026-11-16', jusqua: '2026-11-22' });
  assert.equal(apres.length, 0);
});

test('une absence retire les créneaux qu’elle chevauche, et seulement ceux de son accompagnant', () => {
  const absence: Absence = { id: 'A1', accompagnantId: 'ilyas', du: '2026-11-17T17:20:00Z', au: '2026-11-17T17:50:00Z' };
  const c = genererCreneaux({ regles: [mardiSoir()], absences: [absence], depuis: '2026-11-16', jusqua: '2026-11-22' });
  assert.equal(c.length, 2); // les deux premiers (17:00 et 17:45) chevauchent l'absence
  const autre = genererCreneaux({ regles: [mardiSoir()], absences: [{ ...absence, accompagnantId: 'sarah' }], depuis: '2026-11-16', jusqua: '2026-11-22' });
  assert.equal(autre.length, 4);
});

test('deux accompagnants disponibles en même temps ouvrent deux créneaux distincts', () => {
  const c = genererCreneaux({
    regles: [mardiSoir(), mardiSoir({ id: 'R2', accompagnantId: 'sarah' })],
    absences: [], depuis: '2026-11-17', jusqua: '2026-11-17',
  });
  assert.equal(c.length, 8);
  assert.equal(new Set(c.map((x) => x.id)).size, 8);
});

test('deux règles qui se recouvrent ne créent pas de doublon', () => {
  const c = genererCreneaux({
    regles: [mardiSoir({ fin: '19:00' }), mardiSoir({ id: 'R2', fin: '19:00' })],
    absences: [], depuis: '2026-11-17', jusqua: '2026-11-17',
  });
  assert.equal(c.length, 1);
});

test('l’identifiant d’un créneau est stable et respecte le format du contrat d’API', () => {
  const a = identifiantCreneau('ilyas', '2026-11-17T17:00:00.000Z');
  assert.equal(a, identifiantCreneau('ilyas', '2026-11-17T17:00:00.000Z'));
  assert.notEqual(a, identifiantCreneau('sarah', '2026-11-17T17:00:00.000Z'));
  assert.match(a, FORMAT_IDENTIFIANT);
});

const creneau = (debut: string, statut: Creneau['statut'] = 'libre'): Creneau => ({
  id: identifiantCreneau('ilyas', debut), accompagnantId: 'ilyas', debut,
  fin: new Date(Date.parse(debut) + 1_800_000).toISOString(), statut, origine: 'regle',
});

test('un visiteur ne voit que la fenêtre de réservation : plus de 12 h, moins de 3 semaines', () => {
  const maintenant = new Date('2026-11-17T08:00:00Z');
  const tropProche = creneau('2026-11-17T17:00:00.000Z'); // dans 9 h
  const bon = creneau('2026-11-18T17:00:00.000Z');
  const tropLoin = creneau('2026-12-10T17:00:00.000Z'); // au-delà de 21 jours
  const passe = creneau('2026-11-16T17:00:00.000Z');
  const ferme = creneau('2026-11-19T17:00:00.000Z', 'ferme');
  const pris = creneau('2026-11-20T17:00:00.000Z', 'reserve');
  const vus = creneauxPublics([tropProche, bon, tropLoin, passe, ferme, pris], new Map([['ilyas', 'Ilyas']]), maintenant);
  assert.deepEqual(vus.map((v) => [v.debut, v.disponible]), [
    ['2026-11-18T17:00:00.000Z', true],
    ['2026-11-20T17:00:00.000Z', false], // pris : visible mais désactivé
  ]);
  assert.equal(vus[0]!.accompagnant.prenom, 'Ilyas');
});

test('seul un créneau libre dans la fenêtre est réservable', () => {
  const maintenant = new Date('2026-11-17T08:00:00Z');
  assert.equal(reservable(creneau('2026-11-18T17:00:00.000Z'), maintenant), true);
  assert.equal(reservable(creneau('2026-11-17T17:00:00.000Z'), maintenant), false);
  assert.equal(reservable(creneau('2026-11-18T17:00:00.000Z', 'reserve'), maintenant), false);
  assert.equal(reservable(creneau('2026-11-18T17:00:00.000Z', 'ferme'), maintenant), false);
});

test('les places du mois comptent les créneaux libres encore réservables du mois de Paris', () => {
  const maintenant = new Date('2026-11-17T08:00:00Z');
  const liste = [
    creneau('2026-11-18T17:00:00.000Z'),
    creneau('2026-11-19T17:00:00.000Z'),
    creneau('2026-11-20T17:00:00.000Z', 'reserve'),
    creneau('2026-12-02T17:00:00.000Z'), // décembre : hors du mois
  ];
  assert.equal(placesDuMois(liste, maintenant), 2);
});
