// Test d'intégration du stockage DynamoDB : la suite du contrat, contre une vraie table.
//
//   Contre la préproduction (à lancer par une personne, avec son accès nominatif) :
//     $env:AWS_PROFILE = "horsfiltre-prod"
//     npm.cmd run test:integration
//
// Le test écrit des données d'essai en 2030, avec un accompagnant unique par test, et les supprime à la fin.
// Il refuse de tourner contre une table dont le nom ne commence pas par « preprod- ».
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { definirContrat } from '../../shared/test/contrat-stockage.mts';
import { creerClientDocument, StockageDynamoDB } from '../src/stockage-dynamodb.mts';

const table = process.env.TABLE_NAME ?? 'preprod-horsfiltre';
const region = process.env.AWS_REGION ?? 'eu-west-3';
const emulateur = process.env.DYNAMODB_ENDPOINT; // seulement pour un émulateur local

if (!emulateur && !table.startsWith('preprod-')) {
  throw new Error(`Refus : ce test n'écrit que dans une table dont le nom commence par « preprod- » (reçu : « ${table} »).`);
}

const config: DynamoDBClientConfig = { region };
if (emulateur) {
  config.endpoint = emulateur;
  config.credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
}
const doc = creerClientDocument(config);

/** Même schéma que infra/terraform/modules/donnees : utilisé seulement pour un émulateur. */
async function creerTableEmulee(): Promise<void> {
  const client = new DynamoDBClient(config);
  try {
    await client.send(new DescribeTableCommand({ TableName: table }));
    return;
  } catch {
    // la table n'existe pas encore
  }
  await client.send(new CreateTableCommand({
    TableName: table,
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'PK', KeyType: 'HASH' }, { AttributeName: 'SK', KeyType: 'RANGE' }],
    AttributeDefinitions: ['PK', 'SK', 'GSI2PK', 'GSI2SK', 'GSI3PK', 'GSI3SK', 'GSI5PK'].map((n) => ({ AttributeName: n, AttributeType: 'S' as const })),
    GlobalSecondaryIndexes: [
      { IndexName: 'GSI2', KeySchema: [{ AttributeName: 'GSI2PK', KeyType: 'HASH' }, { AttributeName: 'GSI2SK', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } },
      { IndexName: 'GSI3', KeySchema: [{ AttributeName: 'GSI3PK', KeyType: 'HASH' }, { AttributeName: 'GSI3SK', KeyType: 'RANGE' }], Projection: { ProjectionType: 'ALL' } },
      { IndexName: 'GSI5', KeySchema: [{ AttributeName: 'GSI5PK', KeyType: 'HASH' }], Projection: { ProjectionType: 'KEYS_ONLY' } },
    ],
  }));
}

if (emulateur) await creerTableEmulee();

definirContrat({
  nom: emulateur ? 'DynamoDB émulé' : `DynamoDB ${table}`,
  creer: async () => new StockageDynamoDB(doc, table),
  nettoyer: async (_creneaux, reservations, accompagnants) => {
    // Tout ce qu'un test écrit pour un accompagnant (profil, règles, absences, créneaux) vit dans sa partition.
    for (const acc of accompagnants) {
      let suite: Record<string, unknown> | undefined;
      do {
        const page = await doc.send(new QueryCommand({
          TableName: table, KeyConditionExpression: 'PK = :p', ExpressionAttributeValues: { ':p': `ACCOMP#${acc}` },
          ProjectionExpression: 'PK, SK', ExclusiveStartKey: suite,
        }));
        for (const e of page.Items ?? []) await doc.send(new DeleteCommand({ TableName: table, Key: { PK: e.PK, SK: e.SK } }));
        suite = page.LastEvaluatedKey;
      } while (suite);
    }
    for (const r of reservations) {
      await doc.send(new DeleteCommand({ TableName: table, Key: { PK: `RESA#${r.id}`, SK: 'META' } }));
    }
  },
});
