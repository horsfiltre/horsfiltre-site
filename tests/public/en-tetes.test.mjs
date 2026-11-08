import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PREPROD, PRODUCTION } from '../../public/assets/js/config.js';

// Le bloc d'un chemin dans public/_headers, tel que Cloudflare Pages le lit : le motif, puis ses lignes indentées.
function bloc(motif) {
  const lignes = readFileSync('public/_headers', 'utf8').split('\n');
  const debut = lignes.findIndex((l) => l === motif);
  assert.notEqual(debut, -1, `le bloc ${motif} existe`);
  const corps = [];
  for (const l of lignes.slice(debut + 1)) { if (!/^\s+\S/.test(l)) break; corps.push(l.trim()); }
  return corps;
}
// Sans le nom de l'en-tête : la première directive (default-src) ne doit pas rester collée à lui.
const politique = (motif) => (bloc(motif).find((l) => l.startsWith('Content-Security-Policy:')) ?? '').replace(/^Content-Security-Policy:\s*/, '');
const directive = (texte, nom) => (texte.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${nom} `)) ?? '').split(/\s+/).slice(1);

test('politique de /reserver/* : le navigateur peut appeler l’API de production ET celle de la préproduction (les aperçus)', () => {
  const connect = directive(politique('/reserver/*'), 'connect-src');
  assert.ok(connect.includes(PRODUCTION.api), `connect-src doit nommer ${PRODUCTION.api} : sans cela, chaque appel est bloqué en silence`);
  assert.ok(connect.includes(PREPROD.api), 'les aperçus parlent à la préproduction');
});

test('politique de /reserver/* : rien de permissif, et le contrôle anti-robot de Cloudflare reste autorisé', () => {
  const p = politique('/reserver/*');
  assert.doesNotMatch(p, /\*|unsafe-|http:\/\/|data:.*script/);
  assert.deepEqual(directive(p, 'frame-src'), ['https://challenges.cloudflare.com']);
  assert.ok(directive(p, 'script-src').some((s) => s === 'https://challenges.cloudflare.com'));
  assert.deepEqual(directive(p, 'default-src'), ["'self'"]);
  assert.deepEqual(directive(p, 'frame-ancestors'), ["'none'"]);
});

test('politique de /reserver/* : aucune API en dehors de celles du projet', () => {
  const connect = directive(politique('/reserver/*'), 'connect-src');
  const etrangeres = connect.filter((o) => o !== "'self'" && o !== PRODUCTION.api && o !== PREPROD.api && o !== 'https://cloudflareinsights.com');
  assert.deepEqual(etrangeres, []);
});

test('les pages à jeton ne sont jamais mises en cache ni transmises par le référent', () => {
  assert.ok(bloc('/reserver/gerer/*').includes('Referrer-Policy: no-referrer'));
  assert.ok(bloc('/reserver/gerer/*').includes('Cache-Control: no-store'));
  assert.ok(bloc('/reserver/confirmation/*').includes('Cache-Control: no-store'));
});
