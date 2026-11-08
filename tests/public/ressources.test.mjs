import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Cloudflare Pages répond à un fichier inconnu par la page d'accueil, avec le statut 200. Une police, une icône ou un script qui
// manque ne produit donc aucune erreur 404 : le navigateur reçoit du HTML et échoue en silence. Ce test relit les pages et refuse
// toute ressource locale qui n'existerait pas dans le dépôt.

const RACINE = 'public';
const fichiers = (dossier) => readdirSync(dossier).flatMap((n) => { const c = join(dossier, n); return statSync(c).isDirectory() ? fichiers(c) : [c]; });
const tous = fichiers(RACINE);
const url = (f) => `/${relative(RACINE, f).split('\\').join('/')}`;
const existants = new Set(tous.map(url));
const EXTENSIONS_RESSOURCE = /\.(woff2?|css|js|mjs|svg|png|jpe?g|webp|avif|ico|webmanifest|json|txt|xml|mp4|webm|pdf)$/i;

/** Les références locales (commençant par « / ») que contiennent les pages, feuilles de style et images vectorielles. */
function references() {
  const refs = new Map();
  for (const f of tous.filter((x) => /\.(html|css|svg)$/.test(x))) {
    const texte = readFileSync(f, 'utf8');
    const ajouter = (u) => { if (u.startsWith('/') && !u.startsWith('//')) { const cle = u.split('#')[0].split('?')[0]; refs.set(cle, [...(refs.get(cle) ?? []), url(f)]); } };
    for (const m of texte.matchAll(/(?:href|src)\s*=\s*["'](\/[^"']*)["']/g)) ajouter(m[1]);
    for (const m of texte.matchAll(/url\(\s*["']?(\/[^"')]+)/g)) ajouter(m[1]);
  }
  return refs;
}
const existe = (u) => (u.endsWith('/') ? existants.has(`${u}index.html`) : existants.has(u) || existants.has(`${u}/index.html`));
const estRessource = (u) => EXTENSIONS_RESSOURCE.test(u) && !u.endsWith('.html');

// Pages que les menus et pieds de page annoncent et qui restent à écrire. Un menu qui y pointe est connu et accepté ; un NOUVEAU
// lien vers une page absente ne l'est pas. Quand une page est créée, son adresse doit être retirée d'ici (le test l'exige).
const PAGES_A_ECRIRE = [
  '/methode/', '/histoires/', '/tarifs/', '/parents/', '/equipe/', '/questions/', '/test/', '/chiffres/', '/ressources/', '/verifier/',
  '/coulisses/', '/plan-du-site/', '/accessibilite/', '/cookies/', '/cgv/', '/confidentialite/', '/mentions-legales/',
  '/cgv.html', '/confidentialite.html', '/mentions-legales.html',
];

test('ressources : chaque police, icône, feuille de style et script demandé par une page existe dans le dépôt', () => {
  const absentes = [...references()].filter(([u]) => estRessource(u) && !existe(u)).map(([u, sources]) => `${u} (demandé par ${[...new Set(sources)].join(', ')})`);
  assert.deepEqual(absentes, []);
});

test('ressources : les pages vers lesquelles pointent les menus sont connues ; aucun nouveau lien ne mène à une page absente', () => {
  const absentes = [...references()].filter(([u]) => !estRessource(u) && !existe(u)).map(([u]) => u);
  assert.deepEqual(absentes.filter((u) => !PAGES_A_ECRIRE.includes(u)).sort(), [], 'une page absente que la liste ne connaît pas');
});

test('ressources : la liste des pages à écrire ne garde pas de page qui existe maintenant (elle ne fait que rétrécir)', () => {
  const creees = PAGES_A_ECRIRE.filter((u) => existe(u));
  assert.deepEqual(creees, [], 'ces pages existent : les retirer de PAGES_A_ECRIRE');
});

test('ressources : une police ou une image n’est pas une page HTML déguisée, ni un fichier vide', () => {
  const magie = { woff2: [0x77, 0x4f, 0x46, 0x32], png: [0x89, 0x50, 0x4e, 0x47], ico: [0, 0, 1, 0] };
  for (const f of tous) {
    const ext = f.split('.').pop().toLowerCase();
    if (!magie[ext]) continue;
    const debut = [...readFileSync(f).subarray(0, 4)];
    assert.deepEqual(debut, magie[ext], `${url(f)} n'a pas l'en-tête d'un fichier ${ext}`);
  }
  for (const f of tous.filter((x) => /\.svg$/.test(x))) assert.match(readFileSync(f, 'utf8').trimStart(), /^(<\?xml[^>]*\?>\s*)?<svg\b/, `${url(f)} n'est pas une image SVG`);
});

test('ressources : une police déclarée dans une feuille de style est aussi présente dans la licence des polices', () => {
  const licence = readFileSync('public/fonts/LICENCES-POLICES.txt', 'utf8');
  const nomsDeFichiers = tous.filter((f) => f.startsWith('public/fonts/') && f.endsWith('.woff2')).map((f) => f.split('/').pop());
  for (const nom of nomsDeFichiers) assert.ok(licence.includes(`Fichier : ${nom}`), `${nom} est publiée sans entrée dans LICENCES-POLICES.txt`);
});
