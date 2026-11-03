// Test de charge : plusieurs personnes réservent le même créneau en même temps, plusieurs fois de suite.
// Contrairement au test d'intégration, qui ne le fait qu'une fois, celui-ci provoque de vrais conflits de
// transaction, que l'adaptateur doit rejouer ou traduire en « créneau indisponible ».
//
//   $env:AWS_PROFILE = "horsfiltre-prod"
//   $env:TABLE_NAME = "preprod-horsfiltre"
//   node api\test-integration\course.mts
//
// Variables : TOURS (25 par défaut), CONCURRENTS (5 par défaut). Refuse toute table hors « preprod- ».
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { ErreurMetier, empreinteEmail, identifiantCreneau, nouvelIdentifiant } from '../../shared/src/index.mts';
import { creerClientDocument, StockageDynamoDB } from '../src/stockage-dynamodb.mts';

const table = process.env.TABLE_NAME ?? 'preprod-horsfiltre';
const region = process.env.AWS_REGION ?? 'eu-west-3';
const emulateur = process.env.DYNAMODB_ENDPOINT;
const tours = Number(process.env.TOURS ?? 25);
const concurrents = Number(process.env.CONCURRENTS ?? 5);

if (!emulateur && !table.startsWith('preprod-')) {
  throw new Error(`Refus : ce test n'écrit que dans une table dont le nom commence par « preprod- » (reçu : « ${table} »).`);
}
const config: DynamoDBClientConfig = { region };
if (emulateur) Object.assign(config, { endpoint: emulateur, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
const doc = creerClientDocument(config);
const stockage = new StockageDynamoDB(doc, table);

const issues: Record<string, number> = {};
let toursAnormaux = 0;
const debutTest = Date.now();

for (let tour = 1; tour <= tours; tour++) {
  const acc = `course-${nouvelIdentifiant().toLowerCase()}`;
  const debut = '2030-02-01T17:00:00.000Z';
  const c = { id: identifiantCreneau(acc, debut), accompagnantId: acc, debut, fin: '2030-02-01T17:30:00.000Z',
    statut: 'libre' as const, origine: 'regle' as const, regleId: null, reservationId: null };
  await stockage.ecrireCreneaux([c]);
  const ids: string[] = [];
  const resultats = await Promise.allSettled(Array.from({ length: concurrents }, (_, i) => {
    const email = `p${i}-${acc}@exemple.fr`;
    const id = nouvelIdentifiant();
    ids.push(id);
    return stockage.reserver(c.id, {
      id, creneauId: c.id, accompagnantId: acc, debut, fin: c.fin, statut: 'confirmee', prenom: 'Essai', email,
      empreinteEmail: empreinteEmail(email), recherche: 'cdi', canal: 'visio', whatsapp: null, motivation: null,
      fuseau: 'Europe/Paris', creeLe: new Date().toISOString(),
    });
  }));
  const acceptees = resultats.filter((r) => r.status === 'fulfilled').length;
  for (const r of resultats) {
    const cle = r.status === 'fulfilled' ? 'accepté'
      : r.reason instanceof ErreurMetier ? `refusé (${r.reason.code})`
      : `ERREUR NON TRADUITE (${r.reason instanceof Error ? r.reason.name : String(r.reason)})`;
    issues[cle] = (issues[cle] ?? 0) + 1;
  }
  if (acceptees !== 1) { toursAnormaux++; console.log(`tour ${tour} : ${acceptees} réservation(s) acceptée(s) pour ${concurrents} demandes`); }
  const creneauFinal = await stockage.lireCreneau(c.id);
  if (creneauFinal?.statut !== 'reserve') { toursAnormaux++; console.log(`tour ${tour} : le créneau n'est pas « reserve » à la fin (${creneauFinal?.statut})`); }
  // Nettoyage
  await doc.send(new DeleteCommand({ TableName: table, Key: { PK: `ACCOMP#${acc}`, SK: `CRENEAU#${debut}` } }));
  for (const id of ids) await doc.send(new DeleteCommand({ TableName: table, Key: { PK: `RESA#${id}`, SK: 'META' } }));
}

const nonTraduites = Object.keys(issues).filter((k) => k.startsWith('ERREUR'));
console.log(`\n${tours} tours de ${concurrents} demandes simultanées en ${((Date.now() - debutTest) / 1000).toFixed(1)} s`);
console.log('issues :', issues);
console.log(`tours anormaux : ${toursAnormaux} sur ${tours}`);
if (toursAnormaux > 0 || nonTraduites.length > 0) {
  console.log('ÉCHEC : une seule réservation doit aboutir par tour, et aucune erreur ne doit remonter brute.');
  process.exit(1);
}
console.log('OK : exactement une réservation par tour, aucune erreur brute.');
