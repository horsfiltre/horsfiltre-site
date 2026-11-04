// Construit l'archive de la fonction Lambda : dist/api.zip, avec le code et ses dépendances dans un seul fichier.
//   npm.cmd run construire:api
// Terraform déploie ensuite cette archive (infra/terraform/environnements/preprod).
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { creerZip } from './zip.mjs';

const SORTIE = 'dist/api';
const resultat = await build({
  entryPoints: ['api/src/lambda.mts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: `${SORTIE}/index.mjs`,
  // Certaines dépendances du kit AWS utilisent `require` : en module ES, il faut le recréer.
  banner: { js: "import { createRequire as __creerRequire } from 'node:module'; const require = __creerRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});

const code = await readFile(`${SORTIE}/index.mjs`);
const archive = creerZip([{ nom: 'index.mjs', contenu: code }]);
await mkdir('dist', { recursive: true });
await writeFile('dist/api.zip', archive);

const sources = Object.keys(resultat.metafile.inputs).filter((c) => !c.includes('node_modules'));
console.log(`Fonction construite : dist/api.zip`);
console.log(`  code regroupé : ${(code.length / 1024).toFixed(0)} Ko  |  archive : ${(archive.length / 1024).toFixed(0)} Ko`);
console.log(`  fichiers du dépôt inclus : ${sources.length}`);
console.log(`  empreinte SHA-256 : ${createHash('sha256').update(archive).digest('hex')}`);
