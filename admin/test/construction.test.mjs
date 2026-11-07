import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INTERDITS_EN_PRODUCTION, interditsTrouves, politiqueSecurite, remplacerPolitique, validerConfiguration, versPosix } from '../../scripts/admin-construction.mjs';

// La liste est écrite ici EN CLAIR, et non lue dans le module : vider celle du module ne doit pas affaiblir ce test avec elle.
const MOTS_INTERDITS = ['localhost', '127.0.0.1', 'preprod', 'execute-api', 'pf1k43c6r3'];

const lire = (f) => JSON.parse(readFileSync(f, 'utf8'));
const PROD = () => lire('admin/config.production.json');
const PREPROD = () => lire('admin/config.json');
const erreurDe = (config, env) => { try { validerConfiguration(config, env); return null; } catch (e) { return e.message; } };

test('configuration : les deux vraies configurations du dépôt sont valides pour leur environnement', () => {
  assert.doesNotThrow(() => validerConfiguration(PROD(), 'production'));
  assert.doesNotThrow(() => validerConfiguration(PREPROD(), 'preprod'));
});

test('configuration : la configuration de préproduction est refusée comme configuration de production, et seulement elle', () => {
  assert.match(erreurDe(PREPROD(), 'production'), /horsfiltre\.fr/);
  assert.equal(erreurDe(PROD(), 'preprod'), null); // une configuration de production est valide partout
});

test('configuration : clés manquantes, clés en trop et type erroné sont refusés avec ce qu’il faut corriger', () => {
  const { api, ...sansApi } = PROD();
  assert.match(erreurDe(sansApi, 'production'), /manquante.*api/);
  assert.match(erreurDe({ ...PROD(), apii: 'x' }, 'production'), /inconnue.*apii/);
  assert.match(erreurDe({ ...PROD(), emailsActifs: 'oui' }, 'production'), /true ou false/);
  for (const mauvais of [null, undefined, 42, 'texte', []]) assert.match(erreurDe(mauvais, 'production'), /objet/, JSON.stringify(mauvais));
  assert.match(erreurDe(PROD(), 'recette'), /Environnement inconnu/);
});

test('configuration : une origine doit être https, sans chemin, sans barre finale, sans port', () => {
  for (const api of ['http://api.horsfiltre.fr', 'api.horsfiltre.fr', 'https://api.horsfiltre.fr/', 'https://api.horsfiltre.fr/v1', 'https://api.horsfiltre.fr:8443', '', 'https://', 'https://api.horsfiltre.fr; script-src *']) {
    assert.match(erreurDe({ ...PROD(), api }, 'production'), /origine https/, JSON.stringify(api));
  }
});

test('configuration : en production, jamais l’adresse d’API Gateway, jamais un autre domaine, jamais la préproduction', () => {
  assert.match(erreurDe({ ...PROD(), api: 'https://abc123.execute-api.eu-west-3.amazonaws.com' }, 'production'), /horsfiltre\.fr/);
  assert.match(erreurDe({ ...PROD(), api: 'https://api.exemple.fr' }, 'production'), /horsfiltre\.fr/);
  assert.match(erreurDe({ ...PROD(), api: 'https://api.horsfiltre.fr.pirate.example' }, 'production'), /horsfiltre\.fr/); // un nom qui commence bien, mais n'est pas à nous
  assert.match(erreurDe({ ...PROD(), cognito: 'https://horsfiltre-admin-preprod.auth.eu-west-3.amazoncognito.com' }, 'production'), /préproduction/);
  assert.match(erreurDe({ ...PROD(), cognito: 'https://exemple.fr' }, 'production'), /Cognito/);
});

test('configuration : l’identifiant de client doit ressembler à un identifiant Cognito', () => {
  for (const clientId of ['', 'court', 'A'.repeat(26), 'a'.repeat(40), 'abc def ghi jkl mno pqr', 42]) assert.match(erreurDe({ ...PROD(), clientId }, 'production'), /clientId/, JSON.stringify(clientId));
});

test('politique : elle ne nomme que l’API et la page de connexion, et rien de permissif', () => {
  const p = politiqueSecurite(PROD());
  assert.match(p, /connect-src 'self' https:\/\/api\.horsfiltre\.fr https:\/\/horsfiltre-admin\.auth\.eu-west-3\.amazoncognito\.com;/);
  assert.match(p, /^default-src 'none'; script-src 'self'; style-src 'self'/);
  assert.doesNotMatch(p, /\*|unsafe|http:/);
  for (const d of ["form-action 'none'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'"]) assert.ok(p.includes(d), d);
});

test('politique : celle qui est fabriquée pour la préproduction est exactement celle du fichier de développement (aucune dérive)', () => {
  const dev = readFileSync('admin/_headers', 'utf8');
  assert.equal(remplacerPolitique(dev, PREPROD()), dev);
});

test('en-têtes : seule la ligne de politique change, les autres restent celles du fichier', () => {
  const dev = readFileSync('admin/_headers', 'utf8');
  const prod = remplacerPolitique(dev, PROD());
  const sans = (t) => t.split('\n').filter((l) => !/Content-Security-Policy/.test(l)).join('\n');
  assert.equal(sans(prod), sans(dev));
  assert.ok(prod.includes('X-Frame-Options: DENY') && prod.includes('X-Robots-Tag: noindex, nofollow'));
  assert.throws(() => remplacerPolitique('/*\n  X-Frame-Options: DENY\n', PROD()), /exactement une ligne/);
  assert.throws(() => remplacerPolitique(`${dev}\n  Content-Security-Policy: default-src *\n`, PROD()), /exactement une ligne/);
});

// ---------------------------------------------------------------------------------------------- le vrai script

function construire(environnement) {
  const dossier = mkdtempSync(join(tmpdir(), 'admin-'));
  const r = spawnSync(process.execPath, ['scripts/construire-admin.mjs', '--environnement', environnement, '--sortie', dossier], { encoding: 'utf8' });
  return { dossier, ...r };
}
// Sous Windows, la liste porte des barres inverses : on la ramène à des barres obliques pour comparer la même chose partout.
const tousLesFichiers = (d) => readdirSync(d, { recursive: true }).map(String).filter((f) => statSync(join(d, f)).isFile()).map((f) => f.replaceAll('\\', '/')).sort();

test('script : la production est construite avec sa configuration, sa politique, et seulement ce qui sert au navigateur', () => {
  const r = construire('production');
  try {
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lire(join(r.dossier, 'config.json')), PROD());
    assert.ok(readFileSync(join(r.dossier, '_headers'), 'utf8').includes('connect-src \'self\' https://api.horsfiltre.fr https://horsfiltre-admin.auth'));
    const fichiers = tousLesFichiers(r.dossier);
    assert.ok(fichiers.includes('index.html') && fichiers.includes('js/main.js') && fichiers.includes('styles.css'));
    assert.ok(!fichiers.some((f) => /test|README|package\.json|config\.production/.test(f)), fichiers.join(', '));
  } finally { rmSync(r.dossier, { recursive: true, force: true }); }
});

test('script : rien du résultat de production ne contient la préproduction ni le poste de développement', () => {
  const r = construire('production');
  try {
    for (const f of tousLesFichiers(r.dossier)) {
      const texte = readFileSync(join(r.dossier, f), 'utf8');
      for (const interdit of MOTS_INTERDITS) assert.ok(!texte.includes(interdit), `« ${interdit} » dans ${f}`);
    }
  } finally { rmSync(r.dossier, { recursive: true, force: true }); }
});

test('script : la préproduction se construit aussi, avec ses propres adresses', () => {
  const r = construire('preprod');
  try {
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lire(join(r.dossier, 'config.json')), PREPROD());
    assert.match(readFileSync(join(r.dossier, '_headers'), 'utf8'), /pf1k43c6r3/);
  } finally { rmSync(r.dossier, { recursive: true, force: true }); }
});

test('script : sans environnement, ou avec un environnement inconnu, il refuse et n’écrit rien', () => {
  for (const args of [[], ['--environnement'], ['--environnement', 'recette']]) {
    const dossier = join(tmpdir(), `admin-refus-${Math.random().toString(36).slice(2)}`);
    const r = spawnSync(process.execPath, ['scripts/construire-admin.mjs', ...args, '--sortie', dossier], { encoding: 'utf8' });
    assert.notEqual(r.status, 0, JSON.stringify(args));
    assert.match(r.stderr, /refusée/);
    assert.ok(!existsSync(dossier), 'rien n’est écrit');
  }
});

test('script : une construction relancée repart de zéro (un fichier d’une construction précédente ne survit pas)', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'admin-'));
  try {
    execFileSync(process.execPath, ['scripts/construire-admin.mjs', '--environnement', 'production', '--sortie', dossier]);
    writeFileOubli(dossier);
    execFileSync(process.execPath, ['scripts/construire-admin.mjs', '--environnement', 'production', '--sortie', dossier]);
    assert.ok(!existsSync(join(dossier, 'reste-d-un-essai.js')));
  } finally { rmSync(dossier, { recursive: true, force: true }); }
});
function writeFileOubli(d) { execFileSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(join(d, 'reste-d-un-essai.js'))}, 'localhost')`]); }

test('contrôle de production : chaque mot interdit est trouvé, avec le fichier où il se cache, et un contenu propre ne donne rien', () => {
  assert.deepEqual([...INTERDITS_EN_PRODUCTION].sort(), [...MOTS_INTERDITS].sort());
  for (const mot of MOTS_INTERDITS) {
    assert.deepEqual(interditsTrouves([{ chemin: 'js/x.js', texte: `const a = 'https://${mot}/';` }]), [{ chemin: 'js/x.js', interdit: mot }], mot);
  }
  assert.deepEqual(interditsTrouves([{ chemin: 'a', texte: 'https://api.horsfiltre.fr' }, { chemin: 'b', texte: '' }]), []);
  assert.equal(interditsTrouves([{ chemin: 'a', texte: 'localhost et preprod' }, { chemin: 'b', texte: '127.0.0.1' }]).length, 3);
});

test('script : une configuration invalide est refusée, avec son motif, et rien n’est écrit', () => {
  const invalides = { 'api sans https': { ...PROD(), api: 'http://api.horsfiltre.fr' }, 'adresse de préproduction': PREPROD(), 'clé en trop': { ...PROD(), secret: 'x' } };
  for (const [nom, config] of Object.entries(invalides)) {
    const dossier = join(tmpdir(), `admin-refus-${Math.random().toString(36).slice(2)}`);
    const fichier = join(tmpdir(), `config-${Math.random().toString(36).slice(2)}.json`);
    execFileSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(fichier)}, ${JSON.stringify(JSON.stringify(config))})`]);
    const r = spawnSync(process.execPath, ['scripts/construire-admin.mjs', '--environnement', 'production', '--config', fichier, '--sortie', dossier], { encoding: 'utf8' });
    assert.notEqual(r.status, 0, nom);
    assert.match(r.stderr, /refusée/, nom);
    assert.ok(!existsSync(dossier), `${nom} : rien n'est écrit`);
    rmSync(fichier, { force: true });
  }
});

test('script : une trace de développement dans l’interface fait refuser la production, sans rien laisser à publier', () => {
  const source = mkdtempSync(join(tmpdir(), 'src-'));
  cpSync('admin', source, { recursive: true });
  appendFileSync(join(source, 'js', 'main.js'), '\n// essai : http://localhost:8788\n');
  const sortie = join(tmpdir(), `admin-refus-${Math.random().toString(36).slice(2)}`);
  try {
    const r = spawnSync(process.execPath, ['scripts/construire-admin.mjs', '--environnement', 'production', '--source', source, '--sortie', sortie], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /localhost.*js\/main\.js/);
    assert.ok(!existsSync(sortie), 'une construction refusée ne laisse aucun dossier publiable');
    // La même source est acceptée pour la préproduction : c'est bien la production qui l'interdit.
    const r2 = spawnSync(process.execPath, ['scripts/construire-admin.mjs', '--environnement', 'preprod', '--source', source, '--sortie', sortie], { encoding: 'utf8' });
    assert.equal(r2.status, 0, r2.stderr);
  } finally { rmSync(source, { recursive: true, force: true }); rmSync(sortie, { recursive: true, force: true }); }
});

test('chemins : un chemin Windows est ramené à des barres obliques, un chemin Linux reste tel quel', () => {
  // On passe le séparateur à la main : ce test simule Windows même sur un poste Linux, sans dépendre du système qui l'exécute.
  assert.equal(versPosix('js\\main.js', '\\'), 'js/main.js');
  assert.equal(versPosix('js\\vues\\equipe.js', '\\'), 'js/vues/equipe.js');
  assert.equal(versPosix('js/main.js', '/'), 'js/main.js');
  assert.equal(versPosix('index.html', '\\'), 'index.html');
});

test('contrôle de production : les chemins signalés sont en barres obliques, même quand ils arrivent sous la forme Windows', () => {
  // Le séparateur est donné à la main : ce test simule Windows sur n'importe quel poste.
  const t = interditsTrouves([{ chemin: 'js\\vues\\equipe.js', texte: 'http://localhost:8788' }], '\\');
  assert.deepEqual(t, [{ chemin: 'js/vues/equipe.js', interdit: 'localhost' }]);
  assert.deepEqual(interditsTrouves([{ chemin: 'js/main.js', texte: 'preprod' }], '/'), [{ chemin: 'js/main.js', interdit: 'preprod' }]);
});
