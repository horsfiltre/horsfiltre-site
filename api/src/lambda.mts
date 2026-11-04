// Point d'entrée de la fonction Lambda : traduit un événement d'API Gateway (HTTP API, format 2.0) en requête,
// la passe au gestionnaire (http.mts), et traduit la réponse. Le câblage (stockage, secrets) se fait une seule fois,
// au premier appel, puis la fonction le garde en mémoire.
//
// Identité : elle ne vient QUE du contexte que renseigne l'autorisation JWT d'API Gateway, après vérification de
// la signature du jeton. Aucun en-tête, aucun paramètre fourni par l'appelant n'est jamais lu comme une identité.
import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { Stockage } from '../../shared/src/index.mts';
import { groupesDepuisClaim, type DependancesHttp, type Identite, type Reponse, type Requete } from './commun.mts';
import { creerGestionnaire } from './http.mts';
import { creerClientDocument, StockageDynamoDB } from './stockage-dynamodb.mts';
import { creerVerificateurTurnstile } from './turnstile.mts';

// ------------------------------------------------------------------------------------------------ événement et réponse

export type EvenementApi = {
  rawPath: string;
  queryStringParameters?: Record<string, string | undefined>;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext: {
    requestId: string;
    http: { method: string; sourceIp?: string };
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
};

export type ReponseApi = { statusCode: number; headers: Record<string, string>; body: string };

/** L'identité vérifiée par API Gateway, s'il y en a une. Rien d'autre que le contexte de l'autorisation n'est lu. */
export function identiteDepuisEvenement(evt: EvenementApi): Identite | undefined {
  const claims = evt.requestContext.authorizer?.jwt?.claims;
  if (!claims) return undefined;
  const sub = claims.sub;
  if (typeof sub !== 'string' || !sub) return undefined;
  return { sub, groupes: groupesDepuisClaim(claims['cognito:groups']) };
}

export function versRequete(evt: EvenementApi): Requete {
  const entetes: Record<string, string | undefined> = {};
  for (const [nom, valeur] of Object.entries(evt.headers ?? {})) entetes[nom.toLowerCase()] = valeur;
  const corps = evt.body == null ? null : evt.isBase64Encoded ? Buffer.from(evt.body, 'base64').toString('utf8') : evt.body;
  const identite = identiteDepuisEvenement(evt);
  return {
    methode: evt.requestContext.http.method.toUpperCase(),
    chemin: evt.rawPath,
    requete: { ...(evt.queryStringParameters ?? {}) },
    entetes,
    corps,
    // Derrière Cloudflare, l'adresse du visiteur est dans cf-connecting-ip ; sinon, celle de la connexion.
    ip: entetes['cf-connecting-ip'] ?? evt.requestContext.http.sourceIp,
    idRequete: evt.requestContext.requestId,
    ...(identite ? { identite } : {}),
  };
}

export function versReponseApi(r: Reponse): ReponseApi {
  return { statusCode: r.statut, headers: r.entetes, body: r.corps };
}

// ------------------------------------------------------------------------------------------------ configuration

export type Configuration = {
  nomTable: string;
  originesPubliques: string[];
  originesAdministration: string[];
  paramSecretJeton: string;
  paramSecretTurnstile: string;
  /** Noms d'hôte sur lesquels le widget Turnstile peut s'afficher. Vide : pas de contrôle (préproduction). */
  hotesTurnstile: string[] | undefined;
};

const liste = (v: string | undefined): string[] => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

/** Lit la configuration dans l'environnement de la fonction. Une valeur manquante est une erreur claire, jamais une valeur par défaut silencieuse. */
export function lireConfiguration(env: Record<string, string | undefined>): Configuration {
  const requis = (nom: string): string => {
    const v = env[nom]?.trim();
    if (!v) throw new Error(`Variable d'environnement manquante : ${nom}`);
    return v;
  };
  const hotes = liste(env.TURNSTILE_HOTES);
  return {
    nomTable: requis('TABLE_NAME'),
    originesPubliques: liste(requis('ORIGINES_PUBLIQUES')),
    originesAdministration: liste(requis('ORIGINES_ADMINISTRATION')),
    paramSecretJeton: requis('PARAM_SECRET_JETON'),
    paramSecretTurnstile: requis('PARAM_SECRET_TURNSTILE'),
    hotesTurnstile: hotes.length ? hotes : undefined,
  };
}

// ------------------------------------------------------------------------------------------------ secrets

export type ClientParametres = { send: (commande: GetParametersCommand) => Promise<{ Parameters?: { Name?: string; Value?: string }[]; InvalidParameters?: string[] }> };

const LONGUEUR_MIN_SECRET_JETON = 32;

/** Lit les deux secrets. Les erreurs nomment le paramètre, jamais sa valeur. */
export async function lireSecrets(ssm: ClientParametres, config: Pick<Configuration, 'paramSecretJeton' | 'paramSecretTurnstile'>): Promise<{ jeton: string; turnstile: string }> {
  const r = await ssm.send(new GetParametersCommand({ Names: [config.paramSecretJeton, config.paramSecretTurnstile], WithDecryption: true }));
  if (r.InvalidParameters?.length) throw new Error(`Paramètre introuvable dans le magasin de paramètres : ${r.InvalidParameters.join(', ')}`);
  const valeur = (nom: string): string => {
    const v = r.Parameters?.find((p) => p.Name === nom)?.Value;
    if (!v) throw new Error(`Paramètre vide ou illisible : ${nom}`);
    return v;
  };
  const jeton = valeur(config.paramSecretJeton);
  if (jeton.length < LONGUEUR_MIN_SECRET_JETON) throw new Error(`Le secret ${config.paramSecretJeton} est trop court (${LONGUEUR_MIN_SECRET_JETON} caractères au moins)`);
  return { jeton, turnstile: valeur(config.paramSecretTurnstile) };
}

// ------------------------------------------------------------------------------------------------ application

const DUREE_CACHE_PRENOMS_MS = 5 * 60_000;

export type Injections = {
  ssm?: ClientParametres;
  stockage?: Stockage;
  maintenant?: () => Date;
  fetchImpl?: typeof fetch;
  journal?: (evenement: Record<string, unknown>) => void;
};

/** Construit le gestionnaire : lit les secrets, branche le stockage et la vérification Turnstile. */
export async function creerApplication(config: Configuration, injections: Injections = {}): Promise<(req: Requete) => Promise<Reponse>> {
  const ssm = injections.ssm ?? (new SSMClient({}) as unknown as ClientParametres);
  const secrets = await lireSecrets(ssm, config);
  const stockage = injections.stockage ?? new StockageDynamoDB(creerClientDocument({}), config.nomTable);

  // Les prénoms changent rarement, et la liste des créneaux en a besoin pour chaque ligne : une courte mémoire évite des lectures.
  const prenoms = new Map<string, { prenom: string; jusqua: number }>();
  const maintenant = injections.maintenant ?? (() => new Date());
  const prenomDe: DependancesHttp['prenomDe'] = async (id) => {
    const connu = prenoms.get(id);
    if (connu && connu.jusqua > maintenant().getTime()) return connu.prenom;
    const prenom = (await stockage.lireAccompagnant(id))?.prenom ?? '';
    prenoms.set(id, { prenom, jusqua: maintenant().getTime() + DUREE_CACHE_PRENOMS_MS });
    return prenom;
  };

  return creerGestionnaire({
    stockage,
    maintenant,
    secretJeton: secrets.jeton,
    verifierTurnstile: creerVerificateurTurnstile({ secret: secrets.turnstile, hotesAutorises: config.hotesTurnstile, ...(injections.fetchImpl ? { fetchImpl: injections.fetchImpl } : {}) }),
    prenomDe,
    originesAutorisees: config.originesPubliques,
    originesAdministration: config.originesAdministration,
    journal: injections.journal ?? ((e) => console.log(JSON.stringify(e))),
  });
}

// ------------------------------------------------------------------------------------------------ gestionnaire Lambda

/**
 * Fabrique le gestionnaire. L'initialisation (secrets, stockage) se fait au premier appel et est conservée ; si elle
 * échoue, elle sera retentée à l'appel suivant, et l'appelant reçoit une erreur générique sans aucun détail.
 */
export function creerHandler(initialiser: () => Promise<(req: Requete) => Promise<Reponse>>, journal: (e: Record<string, unknown>) => void = (e) => console.log(JSON.stringify(e))) {
  let application: Promise<(req: Requete) => Promise<Reponse>> | undefined;
  return async (evt: EvenementApi): Promise<ReponseApi> => {
    try {
      application ??= initialiser();
      const gestionnaire = await application.catch((e: unknown) => {
        application = undefined; // on réessaiera au prochain appel
        throw e;
      });
      return versReponseApi(await gestionnaire(versRequete(evt)));
    } catch (e) {
      journal({ niveau: 'erreur', evenement: 'initialisation_ou_traitement_en_echec', erreur: e instanceof Error ? e.name : 'inconnue', message: e instanceof Error ? e.message : undefined });
      return versReponseApi({
        statut: 500,
        entetes: { 'content-type': 'application/problem+json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
        corps: JSON.stringify({ type: 'https://horsfiltre.fr/erreurs/erreur-interne', title: "Une erreur s'est produite. Réessayez dans un instant.", status: 500, code: 'erreur_interne' }),
      });
    }
  };
}

export const handler = creerHandler(() => creerApplication(lireConfiguration(process.env)));
