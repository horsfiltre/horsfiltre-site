import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StockageMemoire, empreinteEmail } from '../../shared/src/index.mts';
import { traiterRetour } from '../src/retours.mts';

const MAINTENANT = new Date('2026-11-12T09:00:00.000Z');
const bounce = (type: string, adresses: string[]) => ({ source: 'aws.ses', detail: { eventType: 'Bounce', bounce: { bounceType: type, bounceSubType: 'General', bouncedRecipients: adresses.map((emailAddress) => ({ emailAddress })) } } });
const plainte = (adresses: string[]) => ({ source: 'aws.ses', detail: { eventType: 'Complaint', complaint: { complainedRecipients: adresses.map((emailAddress) => ({ emailAddress })) } } });
const monde = () => { const stockage = new StockageMemoire(); const journal: Record<string, unknown>[] = []; return { stockage, journal, traiter: (e: unknown) => traiterRetour(stockage, e, MAINTENANT, (x) => journal.push(x)) }; };

test('un rebond définitif marque l’adresse injoignable, sans tenir compte de la casse', async () => {
  const { stockage, traiter } = monde();
  assert.equal(await traiter(bounce('Permanent', ['Personne@Exemple.FR'])), 1);
  assert.equal(await stockage.adresseInjoignable(empreinteEmail('personne@exemple.fr')), true);
  assert.equal(await stockage.adresseInjoignable(empreinteEmail('autre@exemple.fr')), false);
});

test('un rebond passager (boîte pleine) ne marque rien : il peut se résoudre', async () => {
  const { stockage, traiter, journal } = monde();
  assert.equal(await traiter(bounce('Transient', ['pleine@exemple.fr'])), 0);
  assert.equal(await stockage.adresseInjoignable(empreinteEmail('pleine@exemple.fr')), false);
  assert.equal(journal[0]!.evenement, 'retour_ignore');
  assert.equal(await traiter(bounce('Undetermined', ['x@exemple.fr'])), 0);
});

test('une plainte marque l’adresse, avec son motif', async () => {
  const { stockage, traiter } = monde();
  assert.equal(await traiter(plainte(['mecontent@exemple.fr'])), 1);
  assert.equal(await stockage.adresseInjoignable(empreinteEmail('mecontent@exemple.fr')), true);
  assert.equal(stockage.injoignables.get(empreinteEmail('mecontent@exemple.fr'))?.motif, 'plainte');
});

test('plusieurs destinataires, des événements d’un autre type ou mal formés : traités sans erreur, et sans rien marquer d’inattendu', async () => {
  const { stockage, traiter } = monde();
  assert.equal(await traiter(bounce('Permanent', ['a@exemple.fr', 'b@exemple.fr'])), 2);
  for (const mauvais of [null, undefined, 42, 'texte', {}, { detail: null }, { detail: { eventType: 'Delivery' } }, { detail: { eventType: 'Bounce' } }, { detail: { eventType: 'Bounce', bounce: { bounceType: 'Permanent', bouncedRecipients: 'pas une liste' } } },
    bounce('Permanent', ['pas-une-adresse']), bounce('Permanent', [''])]) {
    assert.equal(await traiter(mauvais), 0, JSON.stringify(mauvais));
  }
  assert.equal(stockage.injoignables.size, 2);
});

test('le journal ne contient jamais une adresse e-mail', async () => {
  const { traiter, journal } = monde();
  await traiter(bounce('Permanent', ['secret@exemple.fr'])); await traiter(plainte(['autre@exemple.fr']));
  assert.doesNotMatch(JSON.stringify(journal), /@exemple\.fr/);
});

test('rejouer le même événement ne change rien (EventBridge peut livrer deux fois)', async () => {
  const { stockage, traiter } = monde();
  await traiter(bounce('Permanent', ['a@exemple.fr'])); await traiter(bounce('Permanent', ['a@exemple.fr']));
  assert.equal(stockage.injoignables.size, 1);
});
