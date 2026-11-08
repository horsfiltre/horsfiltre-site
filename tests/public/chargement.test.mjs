import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Ces tests relisent le code : le comportement réel (rien ne clignote) est prouvé dans un navigateur, hors du pipeline. Ici, on
// garde en place ce dont ce comportement dépend, pour qu'un retrait par mégarde se voie.
const html = readFileSync('public/reserver/index.html', 'utf8');
const css = readFileSync('public/assets/css/reserver.css', 'utf8');
const js = readFileSync('public/assets/js/reserver.js', 'utf8');

test('formulaire : il garde sa place sans se montrer tant que la liste des créneaux n’est pas chargée', () => {
  const balise = html.match(/<form\b[^>]*\bid="resa"[^>]*>/)?.[0] ?? '';
  assert.match(balise, /\bdata-chargement\b/, 'le formulaire porte data-chargement dans le HTML');
  const regle = css.match(/\.resa-form\[data-chargement\]\s*\{([^}]*)\}/);
  assert.ok(regle, 'la règle de style existe');
  assert.match(regle[1], /visibility\s*:\s*hidden/);
  // display libérerait la place et décalerait toute la page quand le formulaire apparaît
  assert.doesNotMatch(regle[1], /display\s*:/);
});

test('formulaire : il est révélé dans tous les cas, sinon il resterait invisible pour toujours', () => {
  assert.match(js, /const reveler = \(\) => form\.removeAttribute\('data-chargement'\);/);
  assert.match(js, /if \(FERME\) \{[^}]*form\.hidden = true;[^}]*reveler\(\);/, 'adresse fermée');
  assert.match(js, /sel\.charger\(\)\.then\(\(\) => \{ reveler\(\);/, 'liste chargée');
  assert.match(js, /\.catch\(\(\) => \{ reveler\(\); \$\('\[data-erreur-agenda\]'\)\.hidden = false; \}\)/, 'liste en erreur : le message et « Réessayer » doivent se voir');
  assert.match(js, /sel\.charger\(\)\.then\(reveler\)\.catch/, 'nouvel essai après une erreur');
});

test('formulaire : plus aucun créneau le cache et affiche « complet » ; il n’est jamais caché par défaut dans le HTML', () => {
  assert.match(js, /addEventListener\('agenda:vide', \(\) => \{ \$\('\[data-complet\]'\)\.hidden = false; form\.hidden = true; \}\)/);
  assert.doesNotMatch(html.match(/<form\b[^>]*\bid="resa"[^>]*>/)?.[0] ?? '', /\bhidden\b/);
  assert.match(html, /<div class="card attente" data-complet hidden>/);
});
