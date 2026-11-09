import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// La page d'accueil (Pulse v3) est servie avec une politique de sécurité sans code intégré. Ces tests gardent en place ce qui la
// rend publiable : les « Réserver » mènent à la vraie réservation, aucun lien mort, aucun marqueur à remplir, rien d'intégré.
const html = readFileSync('public/index.html', 'utf8');
const entetes = readFileSync('public/_headers', 'utf8');
// Le texte d'un fragment, sans ses balises : une lecture caractère par caractère (ce n'est pas un nettoyage de sécurité, seulement de quoi comparer des libellés).
function sansBalises(fragment) {
  let dansBalise = false; let texte = '';
  for (const c of fragment) { if (c === '<') dansBalise = true; else if (c === '>') dansBalise = false; else if (!dansBalise) texte += c; }
  return texte.replace(/\s+/g, ' ').trim();
}
const liens = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>(.*?)<\/a>/gis)].map((m) => ({ href: m[1], texte: sansBalises(m[2]) }));

test('accueil : les « Réserver » mènent à la page de réservation, pas à une section de la page', () => {
  const vers = liens.filter((l) => l.href === '/reserver/');
  assert.ok(vers.length >= 4, `au moins quatre liens vers /reserver/ (trouvé : ${vers.length})`);
  assert.ok(vers.some((l) => /^Réserver un échange gratuit$/.test(l.texte)), 'le bouton principal');
  assert.ok(!liens.some((l) => l.href === '#reserver'), 'plus de lien vers la section interne #reserver');
});

test('accueil : aucun lien mort (« # » seul), et chaque ancre interne a sa cible', () => {
  assert.deepEqual(liens.filter((l) => l.href === '#' || l.href === '').map((l) => l.texte), []);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/gi)].map((m) => m[1]));
  const sansCible = liens.filter((l) => /^#./.test(l.href) && !ids.has(l.href.slice(1))).map((l) => l.href);
  assert.deepEqual(sansCible, []);
});

test('accueil : aucun marqueur à remplir dans la page (SIRET, numéro, « à fournir »)', () => {
  // Dans tout le fichier, commentaires compris : un marqueur n'a sa place nulle part dans une page publiée.
  assert.deepEqual(html.match(/\[(numéro|À FOURNIR|A FOURNIR|SIRET|TODO)[^\]]*\]/gi) ?? [], []);
});

test('accueil : le code est externe (aucun script, style ni gestionnaire intégré), comme la politique de sécurité l’exige', () => {
  const scriptsIntegres = [...html.matchAll(/<script\b([^>]*)>/gi)].filter((m) => !/\bsrc=/.test(m[1]) && !/application\/ld\+json/.test(m[1]));
  assert.equal(scriptsIntegres.length, 0, 'aucun <script> intégré');
  assert.equal((html.match(/<style\b/gi) ?? []).length, 0, 'aucun <style> intégré');
  assert.equal((html.match(/\sstyle\s*=/gi) ?? []).length, 0, 'aucun attribut style=');
  assert.equal((html.match(/\son[a-z]+\s*=\s*["']/gi) ?? []).length, 0, 'aucun gestionnaire onclick= et semblables');
  assert.deepEqual([...html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/gi)].map((m) => m[1]), ['/app.js']);
});

test('accueil : la politique générale n’autorise pas le code intégré, et la page ne charge rien d’extérieur', () => {
  const lignes = entetes.split('\n'); const debut = lignes.indexOf('/*'); const corps = [];
  for (const l of lignes.slice(debut + 1)) { if (!/^\s+\S/.test(l)) break; corps.push(l.trim()); }
  const csp = corps.find((l) => l.startsWith('Content-Security-Policy:')) ?? '';
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /script-src 'self' https:\/\/static\.cloudflareinsights\.com;/);
  assert.match(csp, /style-src 'self';/);
  // ni script, ni feuille de style, ni image, ni cadre venant d'ailleurs (les liens de navigation vers les sources, eux, sont permis)
  const externes = [...html.matchAll(/<(?:script|img|iframe|source|link)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]*)"/gi)].map((m) => m[1])
    .filter((u) => !/^https:\/\/horsfiltre\.fr\//.test(u));
  assert.deepEqual(externes, []);
});

test('accueil : indexable, avec son adresse canonique et son image de partage, qui existe', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/horsfiltre\.fr\/">/);
  assert.doesNotMatch(html, /<meta name="robots"[^>]*noindex/i);
  const image = html.match(/<meta property="og:image" content="https:\/\/horsfiltre\.fr(\/[^"]+)"/i)?.[1];
  assert.ok(image && existsSync(`public${image}`), `l'image de partage ${image} existe`);
});

test('accueil : aucun bouton n’annonce un outil ou une affirmation qui n’existe pas encore', () => {
  // Retirés tant que la chose n'existe pas ; à rétablir avec elle (et à retirer de cette liste).
  assert.deepEqual(liens.filter((l) => /Faire le test|Tester mon CV/i.test(l.texte)).map((l) => l.texte), [], 'le test du CV (ADR-0009) n’est pas construit');
  assert.doesNotMatch(html, /id="test"/);
  assert.doesNotMatch(html, /Une entreprise déclarée/, 'tant que le SIRET n’existe pas');
  assert.doesNotMatch(html, /class="wa"/, 'tant que le numéro WhatsApp Business n’existe pas');
});
