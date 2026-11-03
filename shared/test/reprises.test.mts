import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avecReprises } from '../../scripts/reprises.mjs';

const sansAttente = { pause: async () => {} };

test('reprises : une opération qui réussit n’est lancée qu’une fois', async () => {
  let appels = 0;
  const r = await avecReprises(async () => { appels++; return 'ok'; }, sansAttente);
  assert.equal(r, 'ok');
  assert.equal(appels, 1);
});

test('reprises : un échec passager est rejoué, et la trace de chaque échec est conservée', async () => {
  let appels = 0;
  const traces: [string, number][] = [];
  const r = await avecReprises(async () => { appels++; if (appels < 3) throw new Error(`panne ${appels}`); return 'ok'; },
    { ...sansAttente, surEchec: (e: Error, essai: number) => { traces.push([e.message, essai]); } });
  assert.equal(r, 'ok');
  assert.equal(appels, 3);
  assert.deepEqual(traces, [['panne 1', 1], ['panne 2', 2]]);
});

test('reprises : un échec durable s’arrête après le nombre d’essais, avec la dernière erreur', async () => {
  let appels = 0;
  await assert.rejects(avecReprises(async () => { appels++; throw new Error(`panne ${appels}`); }, { ...sansAttente, essais: 3 }), /panne 3/);
  assert.equal(appels, 3);
  let un = 0;
  await assert.rejects(avecReprises(async () => { un++; throw new Error('x'); }, { ...sansAttente, essais: 1 }), /x/);
  assert.equal(un, 1); // un seul essai : aucune reprise
});

test('reprises : l’attente grandit à chaque échec, et n’a pas lieu après le dernier', async () => {
  const attentes: number[] = [];
  await assert.rejects(avecReprises(async () => { throw new Error('x'); }, { essais: 3, pauseMs: 1000, pause: async (ms: number) => { attentes.push(ms); } }));
  assert.deepEqual(attentes, [1000, 2000]);
});
