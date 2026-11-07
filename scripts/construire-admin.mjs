// Construit l'interface d'administration pour un environnement, dans dist/admin (ou le dossier donné par --sortie).
//
//   node scripts/construire-admin.mjs --environnement production
//   node scripts/construire-admin.mjs --environnement preprod --sortie /tmp/essai
//
// Seul ce qui sert au navigateur est copié : ni les tests, ni la documentation, ni la configuration d'un autre environnement.
// La configuration et la politique de sécurité sont celles de l'environnement demandé. Le résultat est vérifié avant d'être rendu :
// en production, il ne doit contenir aucune trace de la préproduction ni du poste de développement.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { interditsTrouves, remplacerPolitique, validerConfiguration } from './admin-construction.mjs';

const arg = (nom) => {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const echec = (message) => {
  console.error(`Construction de l'administration refusée : ${message}`);
  process.exit(1);
};

const environnement = arg('--environnement');
if (!environnement) echec('indiquez --environnement production ou --environnement preprod.');
// --source : un autre dossier que admin/ (les essais y glissent ce que la production doit refuser).
const source = arg('--source') ?? 'admin';
// --config : un autre fichier de configuration (les essais s'en servent pour vérifier que les refus refusent).
const fichierConfig = arg('--config') ?? { production: join(source, 'config.production.json'), preprod: join(source, 'config.json') }[environnement];
if (!fichierConfig) echec(`environnement inconnu : « ${environnement} ».`);
const sortie = arg('--sortie') ?? 'dist/admin';

let config;
try {
  config = validerConfiguration(JSON.parse(readFileSync(fichierConfig, 'utf8')), environnement);
} catch (e) {
  echec(`${fichierConfig} : ${e.message}`);
}

rmSync(sortie, { recursive: true, force: true });
mkdirSync(sortie, { recursive: true });
for (const f of ['index.html', 'styles.css']) cpSync(join(source, f), join(sortie, f));
cpSync(join(source, 'js'), join(sortie, 'js'), { recursive: true });
writeFileSync(join(sortie, 'config.json'), `${JSON.stringify(config, null, 2)}\n`);
writeFileSync(join(sortie, '_headers'), remplacerPolitique(readFileSync(join(source, '_headers'), 'utf8'), config));

// Le contrôle final : on relit ce qui a été écrit, on ne se fie pas à ce qu'on croit avoir écrit.
const fichiers = [];
const parcourir = (dossier) => {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) parcourir(chemin);
    else fichiers.push(chemin);
  }
};
parcourir(sortie);

if (environnement === 'production') {
  const trouves = interditsTrouves(fichiers.map((chemin) => ({ chemin: relative(sortie, chemin), texte: readFileSync(chemin, 'utf8') })));
  if (trouves.length) {
    rmSync(sortie, { recursive: true, force: true }); // une construction refusée ne laisse rien qu'on puisse publier par mégarde
    echec(trouves.map((t) => `« ${t.interdit} » dans ${t.chemin}`).join(' ; ') + ' : la production ne doit pas le contenir.');
  }
}
if (!existsSync(join(sortie, 'index.html'))) echec('index.html est absent du résultat.');

console.log(`Administration construite pour « ${environnement} » : ${sortie}`);
console.log(`  fichiers : ${fichiers.length}`);
console.log(`  API : ${config.api}   connexion : ${config.cognito}`);
console.log(`  politique : connect-src limité à ces deux origines et à lui-même`);
