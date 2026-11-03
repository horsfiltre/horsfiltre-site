import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerPrix } from '../src/prix.mts';

test('15 % du premier salaire brut mensuel, 50 € déjà versés', () => {
  assert.deepEqual(calculerPrix(1200), { total: 180, dejaVerse: 50, aLaSignature: 130 });
  assert.deepEqual(calculerPrix(600), { total: 90, dejaVerse: 50, aLaSignature: 40 });
});

test('le total ne dépasse jamais 350 €', () => {
  assert.equal(calculerPrix(2334).total, 350);
  assert.equal(calculerPrix(3500).total, 350);
  assert.equal(calculerPrix(10_000).total, 350);
  assert.equal(calculerPrix(10_000).aLaSignature, 300);
});

test('le total n’est jamais inférieur aux 50 € déjà versés', () => {
  assert.deepEqual(calculerPrix(300), { total: 50, dejaVerse: 50, aLaSignature: 0 });
  assert.deepEqual(calculerPrix(0), { total: 50, dejaVerse: 50, aLaSignature: 0 });
});

test('l’arrondi se fait à l’euro le plus proche', () => {
  assert.equal(calculerPrix(1210).total, 182); // 181,5
  assert.equal(calculerPrix(1203).total, 180); // 180,45
});

test('un salaire invalide est refusé', () => {
  assert.throws(() => calculerPrix(-1), RangeError);
  assert.throws(() => calculerPrix(Number.NaN), RangeError);
});
