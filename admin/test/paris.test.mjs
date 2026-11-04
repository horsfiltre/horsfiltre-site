import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instantParis as instantParisServeur } from '../../shared/src/temps.mts';
import { ajouterJours, aujourdhuiParis, dateParis, decalageMinutes, heureParis, instantParis, libelleJour } from '../js/paris.js';

test('paris : le décalage est de 60 minutes l’hiver et de 120 minutes l’été', () => {
  assert.equal(decalageMinutes(new Date('2026-01-15T12:00:00Z')), 60);
  assert.equal(decalageMinutes(new Date('2026-07-15T12:00:00Z')), 120);
});

test('paris : l’interface calcule les mêmes instants que l’API, chaque jour de deux ans, y compris les jours de changement d’heure', () => {
  // Les heures testées évitent seulement la plage de 2 h à 3 h, qui n'existe pas au printemps et existe deux fois à l'automne.
  let compares = 0;
  for (let jour = '2026-01-01'; jour <= '2027-12-31'; jour = ajouterJours(jour, 1)) {
    for (const heure of ['00:00', '09:30', '12:00', '18:45', '23:59']) {
      assert.equal(instantParis(jour, heure), instantParisServeur(jour, heure).toISOString(), `${jour} ${heure}`);
      compares++;
    }
  }
  assert.equal(compares, 730 * 5);
});

test('paris : les jours de changement d’heure donnent les bons instants', () => {
  assert.equal(instantParis('2026-03-29', '01:30'), '2026-03-29T00:30:00.000Z'); // encore l'heure d'hiver
  assert.equal(instantParis('2026-03-29', '03:30'), '2026-03-29T01:30:00.000Z'); // déjà l'heure d'été
  assert.equal(instantParis('2026-10-25', '03:30'), '2026-10-25T02:30:00.000Z'); // revenue à l'heure d'hiver
});

test('paris : la date et l’heure sont celles de Paris, pas celles de l’ordinateur', () => {
  assert.equal(dateParis(new Date('2026-12-31T23:30:00Z')), '2027-01-01'); // minuit passé à Paris
  assert.equal(aujourdhuiParis(new Date('2026-06-30T22:30:00Z')), '2026-07-01');
  assert.equal(heureParis('2026-11-10T17:00:00.000Z'), '18:00');
  assert.equal(heureParis('2026-07-14T16:00:00.000Z'), '18:00');
  assert.match(libelleJour('2026-11-10T17:00:00.000Z'), /mardi 10 novembre/);
});

test('paris : ajouter des jours traverse les mois, les années et le 29 février', () => {
  assert.equal(ajouterJours('2026-11-30', 1), '2026-12-01');
  assert.equal(ajouterJours('2026-12-31', 1), '2027-01-01');
  assert.equal(ajouterJours('2028-02-28', 1), '2028-02-29');
  assert.equal(ajouterJours('2026-11-04', 21), '2026-11-25');
  assert.equal(ajouterJours('2026-03-01', -1), '2026-02-28');
});
