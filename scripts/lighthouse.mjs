// Contrôle Lighthouse du site, en remplacement de @lhci/cli (voir ADR-0004).
//
// Pour chaque page HTML de public/ : trois passages en simulation mobile,
// médiane de chaque mesure, comparaison aux seuils de lighthouse.budgets.json.
// Le script échoue (code de sortie 1) si une médiane dépasse un seuil,
// sauf pour les seuils marqués « informatif », qui sont mesurés et affichés sans bloquer.
//
// Utilisation : npm run lighthouse
// Variables utiles : CHROME_PATH (navigateur à utiliser), CHROME_FLAGS (remplace les options de lancement),
// CI (ajoute --no-sandbox ; définie par GitHub Actions).

import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, extname, relative, resolve, sep } from 'node:path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { avecReprises } from './reprises.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const RACINE = resolve('public');
const SORTIE = resolve('.lighthouse');
const budgets = JSON.parse(await readFile('lighthouse.budgets.json', 'utf8'));
const PASSAGES = budgets.passages ?? 3;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

// Petit serveur statique, limité au dossier public/.
function servir() {
  const serveur = createServer(async (req, res) => {
    try {
      let chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let fichier = resolve(join(RACINE, chemin));
      if (fichier !== RACINE && !fichier.startsWith(RACINE + sep)) { res.writeHead(403).end(); return; }
      if ((await stat(fichier).catch(() => null))?.isDirectory()) fichier = join(fichier, 'index.html');
      else if (!extname(fichier) && await stat(fichier + '.html').catch(() => null)) fichier += '.html';
      const corps = await readFile(fichier);
      res.writeHead(200, { 'Content-Type': TYPES[extname(fichier)] ?? 'application/octet-stream' }).end(corps);
    } catch {
      res.writeHead(404).end('Introuvable');
    }
  });
  return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok(serveur)));
}

async function pagesHtml(dossier) {
  const pages = [];
  for (const entree of await readdir(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) { if (!entree.name.startsWith('.')) pages.push(...await pagesHtml(chemin)); }
    else if (entree.name.endsWith('.html')) pages.push('/' + relative(RACINE, chemin).split(sep).join('/'));
  }
  return pages.sort();
}

const mediane = (valeurs) => {
  const v = [...valeurs].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

const serveur = await servir();
const base = `http://127.0.0.1:${serveur.address().port}`;
// Sur un exécuteur GitHub éphémère (variable CI définie), Chrome est lancé sans bac à sable : le seul
// contenu chargé est notre site statique, servi en local. En local, le bac à sable reste actif.
const optionsParDefaut = process.env.CI ? '--headless=new --no-sandbox' : '--headless=new';
// Sur un exécuteur GitHub, Chrome met parfois trop de temps à ouvrir son port de débogage. Le démarrage est rejoué
// jusqu'à trois fois ; à chaque échec, la fin du journal d'erreur de Chrome est affichée, pour qu'une panne durable
// se diagnostique. Seul le démarrage est rejoué : une mesure n'est jamais refaite.
const ESSAIS_DEMARRAGE = 3;

async function demarrerChrome() {
  const profil = mkdtempSync(join(tmpdir(), 'lighthouse-chrome-'));
  const lanceur = new chromeLauncher.Launcher({
    chromePath: process.env.CHROME_PATH || undefined,
    chromeFlags: (process.env.CHROME_FLAGS || optionsParDefaut).split(' ').filter(Boolean),
    userDataDir: profil, // un dossier à nous : le lanceur n'y touche pas, on peut y lire le journal de Chrome
  });
  let reussi = false;
  try {
    await lanceur.launch();
    reussi = true;
    lanceur.profilTemporaire = profil; // supprimé à la fin de la mesure
    return lanceur;
  } catch (erreur) {
    try {
      const fin = readFileSync(join(profil, 'chrome-err.log'), 'utf8').trim().split('\n').slice(-20).join('\n');
      if (fin) console.error(`Journal de Chrome (20 dernières lignes) :\n${fin}`);
    } catch {
      console.error("Journal de Chrome illisible : Chrome n'a probablement rien écrit.");
    }
    lanceur.kill();
    throw erreur;
  } finally {
    if (!reussi) rmSync(profil, { recursive: true, force: true });
  }
}

const chrome = await avecReprises(demarrerChrome, {
  essais: ESSAIS_DEMARRAGE,
  surEchec: (erreur, essai) => console.error(`Chrome n'a pas démarré (essai ${essai}/${ESSAIS_DEMARRAGE}) : ${erreur.message}`),
});
await mkdir(SORTIE, { recursive: true });

const resultats = [];
let echec = false;
try {
  for (const page of await pagesHtml(RACINE)) {
    const mesures = {};
    let rapportMedian = null;
    const passages = [];
    for (let i = 0; i < PASSAGES; i++) {
      const { lhr, report } = await lighthouse(`${base}${page}`, {
        port: chrome.port, output: 'html', logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      });
      passages.push({ lhr, report });
      for (const [cle, regle] of Object.entries(budgets.seuils)) {
        const valeur = regle.categorie
          ? lhr.categories[regle.categorie]?.score
          : lhr.audits[regle.audit]?.numericValue;
        (mesures[cle] ??= []).push(valeur ?? NaN);
      }
    }
    // Le rapport conservé est celui du passage dont la performance est la médiane.
    const perfs = passages.map((p) => p.lhr.categories.performance.score);
    rapportMedian = passages[perfs.indexOf(mediane(perfs))] ?? passages[0];
    const nom = page.replace(/^\//, '').replace(/[\/.]/g, '_');
    await writeFile(join(SORTIE, `${nom}.html`), rapportMedian.report);

    const ligne = { page };
    for (const [cle, regle] of Object.entries(budgets.seuils)) {
      const m = mediane(mesures[cle]);
      const ok = regle.min !== undefined ? m >= regle.min : m <= regle.max;
      ligne[cle] = { mediane: m, passages: mesures[cle], seuil: regle.min ?? regle.max, ok, informatif: !!regle.informatif };
      if (!ok && !regle.informatif) echec = true;
    }
    resultats.push(ligne);
  }
} finally {
  await chrome.kill();
  serveur.close();
  try {
    rmSync(chrome.profilTemporaire, { recursive: true, force: true });
  } catch {
    // un fichier encore ouvert (Windows) : le dossier est temporaire, le système le videra
  }
}

await writeFile(join(SORTIE, 'resume.json'), JSON.stringify(resultats, null, 2));
const afficher = (cle, v) => (budgets.seuils[cle].categorie ? Math.round(v * 100) : Math.round(v * 1000) / 1000);
for (const r of resultats) {
  console.log(`\n${r.page}`);
  for (const [cle, d] of Object.entries(r).filter(([k]) => k !== 'page')) {
    const sens = budgets.seuils[cle].min !== undefined ? '≥' : '≤';
    const etat = d.ok ? 'OK    ' : d.informatif ? 'INFO  ' : 'ÉCHEC ';
    console.log(`  ${etat} ${budgets.seuils[cle].libelle.padEnd(28)} médiane ${String(afficher(cle, d.mediane)).padStart(6)}  seuil ${sens} ${afficher(cle, d.seuil)}  (passages : ${d.passages.map((v) => afficher(cle, v)).join(', ')})`);
  }
}
console.log(echec ? '\nAu moins un seuil est dépassé.' : '\nTous les seuils sont respectés.');
process.exit(echec ? 1 : 0);
