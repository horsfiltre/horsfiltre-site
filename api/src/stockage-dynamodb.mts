// Stockage DynamoDB de la réservation. Il remplit exactement le contrat de `Stockage` (shared/src/stockage.mts),
// vérifié par la même suite de tests que l'implémentation en mémoire (shared/test/contrat-stockage.mts).
//
// Les opérations qui touchent plusieurs éléments sont des TRANSACTIONS : réserver, annuler et reporter réussissent
// en entier ou ne changent rien. Les conditions sont évaluées par DynamoDB au moment de l'écriture : c'est elles
// qui empêchent deux personnes de prendre le même créneau, pas les lectures qui précèdent.
//
// Modèle de données : docs/api/modele-de-donnees.md.
import { DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Absence, Accompagnant, Creneau, Regle, Reservation, Stockage, StatutCreneau } from '../../shared/src/index.mts';
import { ErreurMetier } from '../../shared/src/index.mts';

/**
 * Client à utiliser avec le stockage. Les valeurs absentes (par exemple un créneau sans règle) sont ignorées
 * à l'écriture au lieu de provoquer une erreur.
 */
export function creerClientDocument(config: DynamoDBClientConfig = {}): DynamoDBDocumentClient {
  return DynamoDBDocumentClient.from(new DynamoDBClient(config), { marshallOptions: { removeUndefinedValues: true } });
}

/** [À VALIDER] Les réservations sont supprimées automatiquement 12 mois après la date de l'échange. */
export const CONSERVATION_JOURS = 365;
/** Les créneaux passés sont supprimés automatiquement 30 jours après leur début. */
export const CONSERVATION_CRENEAUX_JOURS = 30;

type Cle = { PK: string; SK: string };
type Element = Record<string, unknown>;

const cleCreneau = (accompagnantId: string, debut: string): Cle => ({ PK: `ACCOMP#${accompagnantId}`, SK: `CRENEAU#${debut}` });
const cleReservation = (id: string): Cle => ({ PK: `RESA#${id}`, SK: 'META' });
const expiration = (debut: string): number => Math.floor(Date.parse(debut) / 1000) + CONSERVATION_JOURS * 86_400;
const cleEmail = (r: Pick<Reservation, 'empreinteEmail' | 'debut' | 'id'>): string => `${r.empreinteEmail}#${r.debut}#${r.id}`;

function creneauVersElement(c: Creneau): Element {
  return {
    ...cleCreneau(c.accompagnantId, c.debut),
    entite: 'creneau',
    id: c.id,
    accompagnantId: c.accompagnantId,
    debut: c.debut,
    fin: c.fin,
    statut: c.statut,
    origine: c.origine,
    regleId: c.regleId ?? undefined,
    reservationId: c.reservationId ?? undefined,
    GSI2PK: `CRENEAUX#${c.statut}`,
    GSI2SK: c.debut,
    GSI5PK: `CRENEAU#${c.id}`,
    expireLe: Math.floor(Date.parse(c.debut) / 1000) + CONSERVATION_CRENEAUX_JOURS * 86_400,
  };
}

function elementVersCreneau(e: Element): Creneau {
  return {
    id: e.id as string,
    accompagnantId: e.accompagnantId as string,
    debut: e.debut as string,
    fin: e.fin as string,
    statut: e.statut as StatutCreneau,
    origine: e.origine as Creneau['origine'],
    regleId: (e.regleId as string | undefined) ?? null,
    reservationId: (e.reservationId as string | undefined) ?? null,
  };
}

function reservationVersElement(r: Reservation): Element {
  return {
    ...cleReservation(r.id),
    entite: 'reservation',
    ...r,
    GSI2PK: `RESERVATIONS#${r.statut}`,
    GSI2SK: r.debut,
    // Index « creux » : seules les réservations actives y figurent.
    ...(r.statut === 'confirmee' ? { GSI3PK: 'EMAIL', GSI3SK: cleEmail(r) } : {}),
    expireLe: expiration(r.debut),
  };
}

function elementVersReservation(e: Element): Reservation {
  return {
    id: e.id as string,
    creneauId: e.creneauId as string,
    accompagnantId: e.accompagnantId as string,
    debut: e.debut as string,
    fin: e.fin as string,
    statut: e.statut as Reservation['statut'],
    prenom: e.prenom as string,
    email: e.email as string,
    empreinteEmail: e.empreinteEmail as string,
    recherche: e.recherche as Reservation['recherche'],
    canal: e.canal as Reservation['canal'],
    whatsapp: (e.whatsapp as string | null | undefined) ?? null,
    motivation: (e.motivation as string | null | undefined) ?? null,
    fuseau: e.fuseau as string,
    creeLe: e.creeLe as string,
  };
}

const cleAccompagnant = (id: string): Cle => ({ PK: `ACCOMP#${id}`, SK: 'PROFIL' });

function elementVersAccompagnant(e: Element): Accompagnant {
  return { id: e.id as string, prenom: e.prenom as string, lienVisio: e.lienVisio as string, actif: e.actif === true };
}

function elementVersRegle(e: Element): Regle {
  return {
    id: e.id as string, accompagnantId: e.accompagnantId as string, jour: e.jour as Regle['jour'],
    debut: e.debut as string, fin: e.fin as string, valideDu: e.valideDu as string, valideAu: (e.valideAu as string | undefined) ?? null,
  };
}

function elementVersAbsence(e: Element): Absence {
  return { id: e.id as string, accompagnantId: e.accompagnantId as string, du: e.du as string, au: e.au as string, motif: (e.motif as string | undefined) ?? null };
}

const meme = (a: Cle, b: Cle): boolean => a.PK === b.PK && a.SK === b.SK;

const nomErreur = (e: unknown): string => (e instanceof Error ? e.name : '');

/** Délais avant chaque nouvel essai d'une transaction en conflit (millisecondes). Trois reprises, puis on abandonne. */
export const DELAIS_REPRISE_MS: readonly number[] = [20, 60, 150];
const pause = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

/** Codes d'annulation d'une transaction, dans l'ordre des éléments envoyés. */
function raisonsAnnulation(e: unknown): string[] | undefined {
  if (nomErreur(e) !== 'TransactionCanceledException') return undefined;
  const raisons = (e as { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
  return raisons?.map((r) => r.Code ?? 'None');
}

/**
 * Quand deux transactions touchent le même élément en même temps, DynamoDB rejette l'une d'elles avec le code
 * `TransactionConflict`. Ce n'est pas un échec de condition : la transaction n'a pas été évaluée.
 */
function enConflit(e: unknown): boolean {
  return nomErreur(e) === 'TransactionInProgressException' || (raisonsAnnulation(e)?.includes('TransactionConflict') ?? false);
}

export class StockageDynamoDB implements Stockage {
  readonly #doc: DynamoDBDocumentClient;
  readonly #table: string;
  readonly #delaisReprise: readonly number[];

  constructor(doc: DynamoDBDocumentClient, nomTable: string, options: { delaisReprise?: readonly number[] } = {}) {
    this.#doc = doc;
    this.#table = nomTable;
    this.#delaisReprise = options.delaisReprise ?? DELAIS_REPRISE_MS;
  }

  /** Envoie une transaction, et la rejoue si elle entre en conflit avec une autre. Les conditions sont réévaluées à chaque essai. */
  async #transaction(elements: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']>): Promise<void> {
    for (let essai = 0; ; essai++) {
      try {
        await this.#doc.send(new TransactWriteCommand({ TransactItems: elements }));
        return;
      } catch (e) {
        if (!enConflit(e) || essai >= this.#delaisReprise.length) throw e;
        await pause(this.#delaisReprise[essai]! + Math.random() * 10);
      }
    }
  }

  // ---------------------------------------------------------------------------------------- créneaux

  async ecrireCreneaux(creneaux: readonly Creneau[]): Promise<void> {
    // Écriture « si absent » : un créneau déjà réservé ou fermé n'est jamais écrasé.
    const ecrire = async (c: Creneau): Promise<void> => {
      try {
        await this.#doc.send(new PutCommand({
          TableName: this.#table,
          Item: creneauVersElement(c),
          ConditionExpression: 'attribute_not_exists(PK)',
        }));
      } catch (e) {
        if (nomErreur(e) !== 'ConditionalCheckFailedException') throw e;
      }
    };
    for (let i = 0; i < creneaux.length; i += 10) await Promise.all(creneaux.slice(i, i + 10).map(ecrire));
  }

  /** Retrouve les clés d'un créneau à partir de l'identifiant que le visiteur transmet. */
  async #cleParIdentifiant(id: string): Promise<Cle | undefined> {
    const r = await this.#doc.send(new QueryCommand({
      TableName: this.#table,
      IndexName: 'GSI5',
      KeyConditionExpression: 'GSI5PK = :p',
      ExpressionAttributeValues: { ':p': `CRENEAU#${id}` },
      Limit: 1,
    }));
    const e = r.Items?.[0];
    return e ? { PK: e.PK as string, SK: e.SK as string } : undefined;
  }

  async lireCreneau(id: string): Promise<Creneau | undefined> {
    const cle = await this.#cleParIdentifiant(id);
    if (!cle) return undefined;
    const r = await this.#doc.send(new GetCommand({ TableName: this.#table, Key: cle, ConsistentRead: true }));
    return r.Item ? elementVersCreneau(r.Item) : undefined;
  }

  async listerCreneaux(depuis: string, jusqua: string): Promise<Creneau[]> {
    const resultat: Creneau[] = [];
    for (const statut of ['libre', 'reserve', 'ferme'] as const) {
      let suite: Record<string, unknown> | undefined;
      do {
        const r = await this.#doc.send(new QueryCommand({
          TableName: this.#table,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :p AND GSI2SK BETWEEN :a AND :b',
          ExpressionAttributeValues: { ':p': `CRENEAUX#${statut}`, ':a': depuis, ':b': jusqua },
          ExclusiveStartKey: suite,
        }));
        for (const e of r.Items ?? []) resultat.push(elementVersCreneau(e));
        suite = r.LastEvaluatedKey;
      } while (suite);
    }
    return resultat.sort((a, b) => a.debut.localeCompare(b.debut));
  }

  async changerStatutCreneau(id: string, statut: 'libre' | 'ferme'): Promise<Creneau> {
    const cle = await this.#cleParIdentifiant(id);
    if (!cle) throw new ErreurMetier('creneau_introuvable');
    try {
      const r = await this.#doc.send(new UpdateCommand({
        TableName: this.#table,
        Key: cle,
        UpdateExpression: 'SET #s = :statut, GSI2PK = :g2',
        // Un créneau réservé ne se ferme pas : il faut d'abord annuler la réservation.
        ConditionExpression: 'attribute_exists(PK) AND #s <> :reserve',
        ExpressionAttributeNames: { '#s': 'statut' },
        ExpressionAttributeValues: { ':statut': statut, ':g2': `CRENEAUX#${statut}`, ':reserve': 'reserve' },
        ReturnValues: 'ALL_NEW',
      }));
      return elementVersCreneau(r.Attributes as Element);
    } catch (e) {
      if (nomErreur(e) === 'ConditionalCheckFailedException') throw new ErreurMetier('creneau_indisponible');
      throw e;
    }
  }

  // ------------------------------------------------------------------------------------ réservations

  async lireReservation(id: string): Promise<Reservation | undefined> {
    const r = await this.#doc.send(new GetCommand({ TableName: this.#table, Key: cleReservation(id), ConsistentRead: true }));
    return r.Item ? elementVersReservation(r.Item) : undefined;
  }

  async compterReservationsActives(empreinteEmail: string): Promise<number> {
    let total = 0;
    let suite: Record<string, unknown> | undefined;
    do {
      const r = await this.#doc.send(new QueryCommand({
        TableName: this.#table,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :p AND begins_with(GSI3SK, :e)',
        ExpressionAttributeValues: { ':p': 'EMAIL', ':e': `${empreinteEmail}#` },
        Select: 'COUNT',
        ExclusiveStartKey: suite,
      }));
      total += r.Count ?? 0;
      suite = r.LastEvaluatedKey;
    } while (suite);
    return total;
  }

  async reserver(creneauId: string, reservation: Reservation): Promise<void> {
    const cle = await this.#cleParIdentifiant(creneauId);
    if (!cle) throw new ErreurMetier('creneau_introuvable');
    try {
      await this.#transaction([
          {
            // 0 : le créneau doit être libre AU MOMENT de l'écriture.
            Update: {
              TableName: this.#table,
              Key: cle,
              UpdateExpression: 'SET #s = :reserve, GSI2PK = :g2, reservationId = :rid',
              ConditionExpression: '#s = :libre',
              ExpressionAttributeNames: { '#s': 'statut' },
              ExpressionAttributeValues: { ':reserve': 'reserve', ':libre': 'libre', ':g2': 'CRENEAUX#reserve', ':rid': reservation.id },
            },
          },
          {
            // 1 : la réservation n'existe pas encore.
            Put: { TableName: this.#table, Item: reservationVersElement(reservation), ConditionExpression: 'attribute_not_exists(PK)' },
          },
        ]);
    } catch (e) {
      // En conflit après plusieurs essais : quelqu'un d'autre est en train de prendre ce créneau.
      if (raisonsAnnulation(e)?.[0] === 'ConditionalCheckFailed' || enConflit(e)) throw new ErreurMetier('creneau_indisponible');
      throw e;
    }
  }

  async annuler(reservationId: string): Promise<Reservation> {
    const r = await this.lireReservation(reservationId);
    if (!r) throw new ErreurMetier('reservation_introuvable');
    if (r.statut === 'annulee') throw new ErreurMetier('reservation_deja_annulee');
    try {
      await this.#transaction([
          {
            // 0 : la réservation sort de l'index des réservations actives.
            Update: {
              TableName: this.#table,
              Key: cleReservation(r.id),
              UpdateExpression: 'SET #s = :annulee, GSI2PK = :g2 REMOVE GSI3PK, GSI3SK',
              ConditionExpression: '#s = :confirmee',
              ExpressionAttributeNames: { '#s': 'statut' },
              ExpressionAttributeValues: { ':annulee': 'annulee', ':confirmee': 'confirmee', ':g2': 'RESERVATIONS#annulee' },
            },
          },
          {
            // 1 : le créneau redevient libre, s'il porte bien cette réservation.
            Update: {
              TableName: this.#table,
              Key: cleCreneau(r.accompagnantId, r.debut),
              UpdateExpression: 'SET #s = :libre, GSI2PK = :g2 REMOVE reservationId',
              ConditionExpression: 'reservationId = :rid',
              ExpressionAttributeNames: { '#s': 'statut' },
              ExpressionAttributeValues: { ':libre': 'libre', ':g2': 'CRENEAUX#libre', ':rid': r.id },
            },
          },
        ]);
    } catch (e) {
      const raisons = raisonsAnnulation(e);
      if (raisons?.[0] === 'ConditionalCheckFailed') throw new ErreurMetier('reservation_deja_annulee');
      if (raisons?.[1] === 'ConditionalCheckFailed') throw new Error(`Incohérence : le créneau de la réservation ${r.id} ne la porte pas`);
      throw e;
    }
    return { ...r, statut: 'annulee' };
  }

  async reporter(reservationId: string, nouveauCreneauId: string): Promise<Reservation> {
    const r = await this.lireReservation(reservationId);
    if (!r) throw new ErreurMetier('reservation_introuvable');
    if (r.statut === 'annulee') throw new ErreurMetier('reservation_deja_annulee');
    const nouveau = await this.lireCreneau(nouveauCreneauId);
    if (!nouveau) throw new ErreurMetier('creneau_introuvable');
    if (nouveau.statut !== 'libre') throw new ErreurMetier('creneau_indisponible');

    const miseAJour: Reservation = {
      ...r,
      creneauId: nouveau.id,
      accompagnantId: nouveau.accompagnantId,
      debut: nouveau.debut,
      fin: nouveau.fin,
    };
    try {
      await this.#transaction([
          {
            // 0 : le nouveau créneau doit être libre AU MOMENT de l'écriture.
            Update: {
              TableName: this.#table,
              Key: cleCreneau(nouveau.accompagnantId, nouveau.debut),
              UpdateExpression: 'SET #s = :reserve, GSI2PK = :g2, reservationId = :rid',
              ConditionExpression: '#s = :libre',
              ExpressionAttributeNames: { '#s': 'statut' },
              ExpressionAttributeValues: { ':reserve': 'reserve', ':libre': 'libre', ':g2': 'CRENEAUX#reserve', ':rid': r.id },
            },
          },
          {
            // 1 : l'ancien créneau est libéré, s'il porte bien cette réservation.
            Update: {
              TableName: this.#table,
              Key: cleCreneau(r.accompagnantId, r.debut),
              UpdateExpression: 'SET #s = :libre, GSI2PK = :g2 REMOVE reservationId',
              ConditionExpression: 'reservationId = :rid',
              ExpressionAttributeNames: { '#s': 'statut' },
              ExpressionAttributeValues: { ':libre': 'libre', ':g2': 'CRENEAUX#libre', ':rid': r.id },
            },
          },
          {
            // 2 : la réservation pointe vers le nouveau créneau, si elle est toujours active et inchangée.
            Update: {
              TableName: this.#table,
              Key: cleReservation(r.id),
              UpdateExpression:
                'SET creneauId = :cid, accompagnantId = :aid, debut = :d, fin = :f, GSI2SK = :d, GSI3SK = :g3, expireLe = :ttl',
              ConditionExpression: '#s = :confirmee AND creneauId = :ancien',
              ExpressionAttributeNames: { '#s': 'statut' },
              ExpressionAttributeValues: {
                ':cid': nouveau.id, ':aid': nouveau.accompagnantId, ':d': nouveau.debut, ':f': nouveau.fin,
                ':g3': cleEmail(miseAJour), ':ttl': expiration(nouveau.debut), ':confirmee': 'confirmee', ':ancien': r.creneauId,
              },
            },
          },
        ]);
    } catch (e) {
      const raisons = raisonsAnnulation(e);
      if (raisons?.[0] === 'ConditionalCheckFailed' || enConflit(e)) throw new ErreurMetier('creneau_indisponible');
      if (raisons?.[2] === 'ConditionalCheckFailed') throw new ErreurMetier('reservation_deja_annulee');
      if (raisons?.[1] === 'ConditionalCheckFailed') throw new Error(`Incohérence : l'ancien créneau de la réservation ${r.id} ne la porte pas`);
      throw e;
    }
    return miseAJour;
  }

  // ------------------------------------------------------------------------------ administration

  /** Retrouve les clés d'une règle ou d'une absence à partir de son identifiant public. */
  async #cleParIdentifiantPublic(genre: 'REGLE' | 'ABSENCE', id: string): Promise<Cle | undefined> {
    const r = await this.#doc.send(new QueryCommand({
      TableName: this.#table, IndexName: 'GSI5', KeyConditionExpression: 'GSI5PK = :p',
      ExpressionAttributeValues: { ':p': `${genre}#${id}` }, Limit: 1,
    }));
    const e = r.Items?.[0];
    return e ? { PK: e.PK as string, SK: e.SK as string } : undefined;
  }

  async #lister(partition: string, prefixe: string): Promise<Element[]> {
    const resultat: Element[] = [];
    let suite: Record<string, unknown> | undefined;
    do {
      const r = await this.#doc.send(new QueryCommand({
        TableName: this.#table, KeyConditionExpression: 'PK = :p AND begins_with(SK, :s)',
        ExpressionAttributeValues: { ':p': partition, ':s': prefixe }, ConsistentRead: true, ExclusiveStartKey: suite,
      }));
      resultat.push(...(r.Items ?? []));
      suite = r.LastEvaluatedKey;
    } while (suite);
    return resultat;
  }

  async listerAccompagnants(): Promise<Accompagnant[]> {
    const resultat: Accompagnant[] = [];
    let suite: Record<string, unknown> | undefined;
    do {
      const r = await this.#doc.send(new QueryCommand({
        TableName: this.#table, IndexName: 'GSI2', KeyConditionExpression: 'GSI2PK = :p',
        ExpressionAttributeValues: { ':p': 'ACCOMPAGNANTS' }, ExclusiveStartKey: suite,
      }));
      for (const e of r.Items ?? []) resultat.push(elementVersAccompagnant(e));
      suite = r.LastEvaluatedKey;
    } while (suite);
    return resultat.sort((a, b) => a.id.localeCompare(b.id));
  }

  async lireAccompagnant(id: string): Promise<Accompagnant | undefined> {
    const r = await this.#doc.send(new GetCommand({ TableName: this.#table, Key: cleAccompagnant(id), ConsistentRead: true }));
    return r.Item ? elementVersAccompagnant(r.Item) : undefined;
  }

  async ecrireAccompagnant(a: Accompagnant): Promise<void> {
    await this.#doc.send(new PutCommand({
      TableName: this.#table,
      Item: { ...cleAccompagnant(a.id), entite: 'accompagnant', id: a.id, prenom: a.prenom, lienVisio: a.lienVisio, actif: a.actif, GSI2PK: 'ACCOMPAGNANTS', GSI2SK: a.id },
    }));
  }

  async listerRegles(accompagnantId: string): Promise<Regle[]> {
    return (await this.#lister(`ACCOMP#${accompagnantId}`, 'REGLE#')).map(elementVersRegle);
  }

  async lireRegle(id: string): Promise<Regle | undefined> {
    const cle = await this.#cleParIdentifiantPublic('REGLE', id);
    if (!cle) return undefined;
    const r = await this.#doc.send(new GetCommand({ TableName: this.#table, Key: cle, ConsistentRead: true }));
    return r.Item ? elementVersRegle(r.Item) : undefined;
  }

  async ecrireRegle(r: Regle): Promise<void> {
    const cle: Cle = { PK: `ACCOMP#${r.accompagnantId}`, SK: `REGLE#${r.id}` };
    const existante = await this.#cleParIdentifiantPublic('REGLE', r.id);
    if (existante && !meme(existante, cle)) throw new Error(`La règle ${r.id} existe déjà pour un autre accompagnant`);
    await this.#doc.send(new PutCommand({
      TableName: this.#table,
      Item: { ...cle, entite: 'regle', id: r.id, accompagnantId: r.accompagnantId, jour: r.jour, debut: r.debut, fin: r.fin, valideDu: r.valideDu, valideAu: r.valideAu ?? undefined, GSI5PK: `REGLE#${r.id}` },
    }));
  }

  async supprimerRegle(id: string): Promise<boolean> {
    const cle = await this.#cleParIdentifiantPublic('REGLE', id);
    if (!cle) return false;
    await this.#doc.send(new DeleteCommand({ TableName: this.#table, Key: cle }));
    return true;
  }

  async listerAbsences(accompagnantId: string): Promise<Absence[]> {
    return (await this.#lister(`ACCOMP#${accompagnantId}`, 'ABSENCE#')).map(elementVersAbsence);
  }

  async lireAbsence(id: string): Promise<Absence | undefined> {
    const cle = await this.#cleParIdentifiantPublic('ABSENCE', id);
    if (!cle) return undefined;
    const r = await this.#doc.send(new GetCommand({ TableName: this.#table, Key: cle, ConsistentRead: true }));
    return r.Item ? elementVersAbsence(r.Item) : undefined;
  }

  async ecrireAbsence(a: Absence): Promise<void> {
    const cle: Cle = { PK: `ACCOMP#${a.accompagnantId}`, SK: `ABSENCE#${a.du}#${a.id}` };
    const existante = await this.#cleParIdentifiantPublic('ABSENCE', a.id);
    if (existante && !meme(existante, cle)) throw new Error(`L'absence ${a.id} existe déjà avec d'autres dates ou un autre accompagnant`);
    await this.#doc.send(new PutCommand({
      TableName: this.#table,
      Item: { ...cle, entite: 'absence', id: a.id, accompagnantId: a.accompagnantId, du: a.du, au: a.au, motif: a.motif ?? undefined, GSI5PK: `ABSENCE#${a.id}` },
    }));
  }

  async supprimerAbsence(id: string): Promise<boolean> {
    const cle = await this.#cleParIdentifiantPublic('ABSENCE', id);
    if (!cle) return false;
    await this.#doc.send(new DeleteCommand({ TableName: this.#table, Key: cle }));
    return true;
  }

  async supprimerCreneau(id: string): Promise<'supprime' | 'absent' | 'reserve'> {
    const cle = await this.#cleParIdentifiant(id);
    if (!cle) return 'absent';
    try {
      await this.#doc.send(new DeleteCommand({
        TableName: this.#table, Key: cle,
        // Atomique : un créneau réservé entre la lecture et la suppression n'est jamais supprimé.
        ConditionExpression: 'attribute_exists(PK) AND #s <> :reserve',
        ExpressionAttributeNames: { '#s': 'statut' }, ExpressionAttributeValues: { ':reserve': 'reserve' },
      }));
      return 'supprime';
    } catch (e) {
      if (nomErreur(e) !== 'ConditionalCheckFailedException') throw e;
      const encore = await this.#doc.send(new GetCommand({ TableName: this.#table, Key: cle, ConsistentRead: true }));
      return encore.Item ? 'reserve' : 'absent';
    }
  }

  async listerReservations(depuis: string, jusqua: string): Promise<Reservation[]> {
    const resultat: Reservation[] = [];
    for (const statut of ['confirmee', 'annulee'] as const) {
      let suite: Record<string, unknown> | undefined;
      do {
        const r = await this.#doc.send(new QueryCommand({
          TableName: this.#table, IndexName: 'GSI2', KeyConditionExpression: 'GSI2PK = :p AND GSI2SK BETWEEN :a AND :b',
          ExpressionAttributeValues: { ':p': `RESERVATIONS#${statut}`, ':a': depuis, ':b': jusqua }, ExclusiveStartKey: suite,
        }));
        for (const e of r.Items ?? []) resultat.push(elementVersReservation(e));
        suite = r.LastEvaluatedKey;
      } while (suite);
    }
    return resultat.sort((a, b) => a.debut.localeCompare(b.debut) || a.id.localeCompare(b.id));
  }
}
