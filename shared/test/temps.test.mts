import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ajouterJours, dateParis, decalageParisMs, fuseauValide, instantParis, jourDeLaSemaine } from '../src/temps.mts';

test('le décalage de Paris suit l’heure d’hiver et l’heure d’été', () => {
  assert.equal(decalageParisMs(Date.parse('2026-01-15T12:00:00Z')), 3_600_000);
  assert.equal(decalageParisMs(Date.parse('2026-07-01T12:00:00Z')), 7_200_000);
});

test('une heure de Paris devient le bon instant UTC, été comme hiver', () => {
  assert.equal(instantParis('2026-11-17', '10:00').toISOString(), '2026-11-17T09:00:00.000Z');
  assert.equal(instantParis('2026-07-01', '10:00').toISOString(), '2026-07-01T08:00:00.000Z');
});

test('les jours de changement d’heure sont corrects', () => {
  // Printemps 2026 : à 2 h, il est 3 h (29 mars).
  assert.equal(instantParis('2026-03-29', '01:30').toISOString(), '2026-03-29T00:30:00.000Z');
  assert.equal(instantParis('2026-03-29', '03:30').toISOString(), '2026-03-29T01:30:00.000Z');
  // Automne 2026 : à 3 h, il est 2 h (25 octobre).
  assert.equal(instantParis('2026-10-24', '10:00').toISOString(), '2026-10-24T08:00:00.000Z');
  assert.equal(instantParis('2026-10-25', '10:00').toISOString(), '2026-10-25T09:00:00.000Z');
});

test('une date ou une heure invalide est refusée', () => {
  assert.throws(() => instantParis('17/11/2026', '10:00'), RangeError);
  assert.throws(() => instantParis('2026-11-17', '25:00'), RangeError);
});

test('jour de la semaine, ajout de jours, date de Paris', () => {
  assert.equal(jourDeLaSemaine('2026-11-17'), 'mardi');
  assert.equal(jourDeLaSemaine('2026-11-01'), 'dimanche');
  assert.equal(ajouterJours('2026-11-30', 1), '2026-12-01');
  assert.equal(ajouterJours('2026-02-28', 1), '2026-03-01');
  // 23 h 30 UTC, c'est déjà le lendemain à Paris.
  assert.equal(dateParis(new Date('2026-11-17T23:30:00Z')), '2026-11-18');
});

test('un fuseau inconnu est détecté', () => {
  assert.equal(fuseauValide('Africa/Casablanca'), true);
  assert.equal(fuseauValide('Mars/Phobos'), false);
});
