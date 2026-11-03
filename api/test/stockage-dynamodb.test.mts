// Le comportement de l'adaptateur face aux réponses de DynamoDB que l'émulateur ne produit pas : conflits de
// transaction, échecs de condition à un rang précis, erreurs inattendues. Le client est un faux, scripté.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GetCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ErreurMetier, empreinteEmail, identifiantCreneau, nouvelIdentifiant, type Reservation } from '../../shared/src/index.mts';
import { StockageDynamoDB } from '../src/stockage-dynamodb.mts';

const ACC = 'ilyas';
const debut = (jour: number): string => new Date(Date.UTC(2030, 0, jour, 17, 0)).toISOString();
const creneau = (jour: number, statut = 'libre', reservationId?: string) => {
  const d = debut(jour);
  return { PK: `ACCOMP#${ACC}`, SK: `CRENEAU#${d}`, entite: 'creneau', id: identifiantCreneau(ACC, d), accompagnantId: ACC, debut: d,
    fin: new Date(Date.parse(d) + 1_800_000).toISOString(), statut, origine: 'regle', reservationId };
};
const reservation = (jour: number, statut: Reservation['statut'] = 'confirmee'): Reservation => {
  const c = creneau(jour);
  return { id: nouvelIdentifiant(), creneauId: c.id, accompagnantId: ACC, debut: c.debut, fin: c.fin, statut, prenom: 'Sarah',
    email: 's@exemple.fr', empreinteEmail: empreinteEmail('s@exemple.fr'), recherche: 'alternance', canal: 'visio',
    whatsapp: null, motivation: null, fuseau: 'Europe/Paris', creeLe: '2026-11-03T10:00:00.000Z' };
};

/** Erreur que renvoie DynamoDB quand une transaction est annulée : un code par élément, dans l'ordre. */
const annulation = (...codes: string[]): Error =>
  Object.assign(new Error('Transaction cancelled'), { name: 'TransactionCanceledException', CancellationReasons: codes.map((Code) => ({ Code })) });

type Issue = 'ok' | Error;

/** Un faux client : retrouve les créneaux et la réservation fournis, et rejoue les issues scriptées des transactions. */
function faux(donnees: { creneaux?: ReturnType<typeof creneau>[]; reservation?: Reservation }, issues: Issue[]) {
  let envois = 0;
  const client = {
    async send(cmd: unknown) {
      if (cmd instanceof QueryCommand) {
        const id = String((cmd.input.ExpressionAttributeValues as Record<string, string>)[':p']).replace('CRENEAU#', '');
        const c = donnees.creneaux?.find((x) => x.id === id);
        return { Items: c ? [{ PK: c.PK, SK: c.SK }] : [] };
      }
      if (cmd instanceof GetCommand) {
        const cle = cmd.input.Key as { PK: string; SK: string };
        if (cle.PK.startsWith('RESA#')) return { Item: donnees.reservation && donnees.reservation.id === cle.PK.slice(5) ? { ...donnees.reservation } : undefined };
        return { Item: donnees.creneaux?.find((c) => c.PK === cle.PK && c.SK === cle.SK) };
      }
      if (cmd instanceof TransactWriteCommand) {
        const issue = issues[envois++] ?? 'ok';
        if (issue !== 'ok') throw issue;
        return {};
      }
      throw new Error(`commande inattendue : ${String((cmd as { constructor: { name: string } }).constructor.name)}`);
    },
  };
  return { stockage: new StockageDynamoDB(client as unknown as DynamoDBDocumentClient, 'preprod-horsfiltre', { delaisReprise: [0, 0, 0] }), envois: () => envois };
}
const code = async (p: Promise<unknown>): Promise<string> => {
  try { await p; return 'aucune erreur'; } catch (e) { return e instanceof ErreurMetier ? e.code : `AUTRE : ${e instanceof Error ? e.message : String(e)}`; }
};

test('réserver : un conflit de transaction est rejoué, puis réussit', async () => {
  const c = creneau(7);
  const { stockage, envois } = faux({ creneaux: [c] }, [annulation('TransactionConflict', 'None'), annulation('TransactionConflict', 'None')]);
  await stockage.reserver(c.id, reservation(7));
  assert.equal(envois(), 3);
});

test('réserver : des conflits sans fin deviennent « créneau indisponible », après trois reprises', async () => {
  const c = creneau(7);
  const conflit = annulation('TransactionConflict', 'None');
  const { stockage, envois } = faux({ creneaux: [c] }, [conflit, conflit, conflit, conflit, conflit]);
  assert.equal(await code(stockage.reserver(c.id, reservation(7))), 'creneau_indisponible');
  assert.equal(envois(), 4); // l'essai initial et trois reprises
});

test('réserver : un échec de condition sur le créneau n’est pas rejoué', async () => {
  const c = creneau(7);
  const { stockage, envois } = faux({ creneaux: [c] }, [annulation('ConditionalCheckFailed', 'None')]);
  assert.equal(await code(stockage.reserver(c.id, reservation(7))), 'creneau_indisponible');
  assert.equal(envois(), 1);
});

test('réserver : un créneau inconnu n’envoie aucune transaction', async () => {
  const { stockage, envois } = faux({ creneaux: [] }, []);
  assert.equal(await code(stockage.reserver('0'.repeat(26), reservation(7))), 'creneau_introuvable');
  assert.equal(envois(), 0);
});

test('réserver : une erreur inattendue remonte telle quelle, sans reprise', async () => {
  const c = creneau(7);
  const { stockage, envois } = faux({ creneaux: [c] }, [Object.assign(new Error('Item size exceeded'), { name: 'ValidationException' })]);
  assert.equal(await code(stockage.reserver(c.id, reservation(7))), 'AUTRE : Item size exceeded');
  assert.equal(envois(), 1);
});

test('réserver : le conflit sur le deuxième élément, la réservation, est rejoué lui aussi', async () => {
  const c = creneau(7);
  const { stockage, envois } = faux({ creneaux: [c] }, [annulation('None', 'TransactionConflict')]);
  await stockage.reserver(c.id, reservation(7));
  assert.equal(envois(), 2);
});

test('annuler : un conflit est rejoué ; un échec de condition sur la réservation est « déjà annulée »', async () => {
  const r = reservation(7);
  const a = faux({ reservation: r, creneaux: [creneau(7, 'reserve', r.id)] }, [annulation('TransactionConflict', 'None')]);
  assert.equal((await a.stockage.annuler(r.id)).statut, 'annulee');
  assert.equal(a.envois(), 2);

  const b = faux({ reservation: r, creneaux: [creneau(7, 'reserve', r.id)] }, [annulation('ConditionalCheckFailed', 'None')]);
  assert.equal(await code(b.stockage.annuler(r.id)), 'reservation_deja_annulee');
});

test('annuler : un créneau qui ne porte pas la réservation est une incohérence signalée, pas masquée', async () => {
  const r = reservation(7);
  const { stockage } = faux({ reservation: r, creneaux: [creneau(7, 'reserve', 'autre')] }, [annulation('None', 'ConditionalCheckFailed')]);
  assert.match(await code(stockage.annuler(r.id)), /^AUTRE : Incohérence/);
});

test('annuler : une réservation déjà annulée n’envoie aucune transaction', async () => {
  const r = reservation(7, 'annulee');
  const { stockage, envois } = faux({ reservation: r }, []);
  assert.equal(await code(stockage.annuler(r.id)), 'reservation_deja_annulee');
  assert.equal(envois(), 0);
});

test('reporter : un conflit est rejoué ; le nouveau créneau pris, ou la réservation déjà annulée, sont distingués', async () => {
  const r = reservation(7);
  const ancien = creneau(7, 'reserve', r.id);
  const nouveau = creneau(8);
  const a = faux({ reservation: r, creneaux: [ancien, nouveau] }, [annulation('None', 'None', 'TransactionConflict')]);
  const apres = await a.stockage.reporter(r.id, nouveau.id);
  assert.equal(apres.creneauId, nouveau.id);
  assert.equal(a.envois(), 2);

  const b = faux({ reservation: r, creneaux: [ancien, nouveau] }, [annulation('ConditionalCheckFailed', 'None', 'None')]);
  assert.equal(await code(b.stockage.reporter(r.id, nouveau.id)), 'creneau_indisponible');

  const c = faux({ reservation: r, creneaux: [ancien, nouveau] }, [annulation('None', 'None', 'ConditionalCheckFailed')]);
  assert.equal(await code(c.stockage.reporter(r.id, nouveau.id)), 'reservation_deja_annulee');
});

test('reporter : un nouveau créneau déjà pris est refusé avant toute transaction', async () => {
  const r = reservation(7);
  const { stockage, envois } = faux({ reservation: r, creneaux: [creneau(7, 'reserve', r.id), creneau(8, 'reserve', 'autre')] }, []);
  assert.equal(await code(stockage.reporter(r.id, creneau(8).id)), 'creneau_indisponible');
  assert.equal(envois(), 0);
});
