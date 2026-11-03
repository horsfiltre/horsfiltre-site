// Écrit les accompagnants dans la table, à partir d'un fichier local. Idempotent : on peut le relancer à volonté.
//
//   $env:AWS_PROFILE = "horsfiltre-prod"
//   $env:TABLE_NAME = "preprod-horsfiltre"
//   node api\scripts\amorcer-accompagnants.mts                  # simulation : n'écrit rien
//   node api\scripts\amorcer-accompagnants.mts --appliquer      # écrit
//
// Fichier par défaut : docs/sources/accompagnants.txt (ignoré par Git). Un autre chemin peut être donné en argument.
// Contre une table dont le nom ne commence pas par « preprod- », il faut ajouter --production.
import { readFileSync } from 'node:fs';
import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { creerClientDocument, StockageDynamoDB } from '../src/stockage-dynamodb.mts';
import { lireAccompagnants, masquerLien } from '../src/amorcage.mts';

const arguments_ = process.argv.slice(2);
const fichier = arguments_.find((a) => !a.startsWith('--')) ?? 'docs/sources/accompagnants.txt';
const appliquer = arguments_.includes('--appliquer');
const production = arguments_.includes('--production');
const table = process.env.TABLE_NAME ?? 'preprod-horsfiltre';
const emulateur = process.env.DYNAMODB_ENDPOINT;

if (!emulateur && !table.startsWith('preprod-') && !production) {
  console.error(`Refus : la table « ${table} » n'est pas une préproduction. Ajoutez --production si c'est voulu.`);
  process.exit(1);
}

let texte: string;
try {
  texte = readFileSync(fichier, 'utf8');
} catch {
  console.error(`Fichier introuvable : ${fichier}\nCréez-le, une ligne par accompagnant :  identifiant : Prénom : https://meet.google.com/xxx-xxxx-xxx`);
  process.exit(1);
}

const { accompagnants, erreurs } = lireAccompagnants(texte);
if (erreurs.length > 0) {
  console.error(`Le fichier ${fichier} contient des erreurs, rien n'a été écrit :`);
  for (const e of erreurs) console.error(`  - ${e}`);
  process.exit(1);
}

const config: DynamoDBClientConfig = { region: process.env.AWS_REGION ?? 'eu-west-3' };
if (emulateur) Object.assign(config, { endpoint: emulateur, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
const stockage = new StockageDynamoDB(creerClientDocument(config), table);

console.log(`Table : ${table}${appliquer ? "" : "   (simulation : rien n'est écrit)"}`);
for (const a of accompagnants) {
  const existant = await stockage.lireAccompagnant(a.id);
  const etat = !existant ? 'création' : existant.prenom === a.prenom && existant.lienVisio === a.lienVisio && existant.actif === a.actif ? 'inchangé' : 'mise à jour';
  console.log(`  ${a.id.padEnd(12)} ${a.prenom.padEnd(14)} ${masquerLien(a.lienVisio)}   ${etat}`);
  if (appliquer && etat !== 'inchangé') await stockage.ecrireAccompagnant(a);
}

if (appliquer) {
  const relus = await stockage.listerAccompagnants();
  console.log(`\nÉcrit. La table contient maintenant ${relus.length} accompagnant(s) : ${relus.map((r) => r.id).join(', ')}.`);
} else {
  console.log('\nSimulation terminée. Relancez avec --appliquer pour écrire.');
}
