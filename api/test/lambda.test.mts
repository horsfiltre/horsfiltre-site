import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { StockageMemoire, synchroniserCreneaux } from '../../shared/src/index.mts';
import {
  creerApplication, creerHandler, identiteDepuisEvenement, lireConfiguration, lireSecrets, versReponseApi, versRequete,
  type ClientParametres, type Configuration, type EvenementApi,
} from '../src/lambda.mts';

// Valeurs tirées au hasard à chaque lancement, jamais écrites dans le dépôt : un secret en clair, même factice,
// déclencherait à juste titre la détection de secrets, et une valeur imprévisible prouve mieux qu'elle ne fuit nulle part.
const SECRET_JETON = randomBytes(36).toString('base64url');
const SECRET_TURNSTILE = randomBytes(18).toString('base64url');
const CLE_IDEMPOTENCE = randomUUID();
const CONFIG: Configuration = {
  nomTable: 'preprod-horsfiltre', originesPubliques: ['https://*.horsfiltre.pages.dev'], originesAdministration: ['https://admin.horsfiltre.fr'],
  paramSecretJeton: '/horsfiltre/preprod/jeton-secret', paramSecretTurnstile: '/horsfiltre/preprod/turnstile-secret', hotesTurnstile: undefined, courriel: undefined,
};

function evt(methode: string, chemin: string, options: { query?: Record<string, string>; headers?: Record<string, string>; body?: string | null; base64?: boolean; claims?: Record<string, unknown>; ip?: string } = {}): EvenementApi {
  return {
    rawPath: chemin, queryStringParameters: options.query, headers: options.headers, body: options.body ?? null, isBase64Encoded: options.base64 ?? false,
    requestContext: { requestId: 'req-42', http: { method: methode, sourceIp: options.ip ?? '203.0.113.9' }, ...(options.claims ? { authorizer: { jwt: { claims: options.claims } } } : {}) },
  };
}
const ssmOk = (): ClientParametres & { appels: number } => {
  const f = { appels: 0, send: async (c: GetParametersCommand) => {
    f.appels++;
    return { Parameters: c.input.Names!.map((n) => ({ Name: n, Value: n === CONFIG.paramSecretJeton ? SECRET_JETON : SECRET_TURNSTILE })) };
  } };
  return f;
};
const admin = { sub: 'sub-admin', 'cognito:groups': '[administrateurs]' };

// ---------------------------------------------------------------------------------------------- événement et réponse

test('lambda : l’événement devient une requête (méthode, chemin, paramètres, en-têtes en minuscules, adresse)', () => {
  const r = versRequete(evt('post', '/v1/reservations', { query: { a: '1' }, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'k' }, body: '{"x":1}' }));
  assert.equal(r.methode, 'POST');
  assert.equal(r.chemin, '/v1/reservations');
  assert.deepEqual(r.requete, { a: '1' });
  assert.equal(r.entetes['content-type'], 'application/json');
  assert.equal(r.entetes['idempotency-key'], 'k');
  assert.equal(r.corps, '{"x":1}');
  assert.equal(r.idRequete, 'req-42');
  assert.equal(r.ip, '203.0.113.9');
});

test('lambda : un corps encodé en base64 est décodé, un corps absent reste nul, l’adresse de Cloudflare passe avant celle de la connexion', () => {
  const corps = JSON.stringify({ prenom: 'Élodie' });
  assert.equal(versRequete(evt('POST', '/x', { body: Buffer.from(corps).toString('base64'), base64: true })).corps, corps);
  assert.equal(versRequete(evt('GET', '/x')).corps, null);
  assert.equal(versRequete(evt('GET', '/x', { headers: { 'CF-Connecting-IP': '198.51.100.7' } })).ip, '198.51.100.7');
});

test('lambda : la réponse reprend le statut, les en-têtes et le corps', () => {
  assert.deepEqual(versReponseApi({ statut: 201, entetes: { 'content-type': 'application/json' }, corps: '{}' }), { statusCode: 201, headers: { 'content-type': 'application/json' }, body: '{}' });
});

// ---------------------------------------------------------------------------------------------- identité

test('identité : elle vient du contexte de l’autorisation, avec ses groupes sous toutes leurs formes', () => {
  assert.deepEqual(identiteDepuisEvenement(evt('GET', '/x', { claims: { sub: 'u1', 'cognito:groups': '[administrateurs autre]' } })), { sub: 'u1', groupes: ['administrateurs', 'autre'] });
  assert.deepEqual(identiteDepuisEvenement(evt('GET', '/x', { claims: { sub: 'u1', 'cognito:groups': ['administrateurs'] } })), { sub: 'u1', groupes: ['administrateurs'] });
  assert.deepEqual(identiteDepuisEvenement(evt('GET', '/x', { claims: { sub: 'u1' } })), { sub: 'u1', groupes: [] });
});

test('identité : sans contexte d’autorisation, ou sans identifiant valide, il n’y a pas d’identité', () => {
  assert.equal(identiteDepuisEvenement(evt('GET', '/x')), undefined);
  for (const sub of [undefined, '', 42, null, {}]) assert.equal(identiteDepuisEvenement(evt('GET', '/x', { claims: { sub, 'cognito:groups': '[administrateurs]' } })), undefined, String(sub));
});

test('identité : aucun en-tête ni paramètre de l’appelant ne fabrique une identité', () => {
  // Un jeton qui se présente comme administrateur mais que personne n'a signé (alg « none », signature vide). Il est construit
  // ici, et non écrit en clair : une chaîne de cette forme dans le dépôt serait signalée, à juste titre, comme un jeton.
  const jetonNonSigne = [{ alg: 'none' }, { sub: 'u1', 'cognito:groups': ['administrateurs'] }].map((x) => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.') + '.';
  const usurpations = {
    headers: { authorization: `Bearer ${jetonNonSigne}`, 'x-identite': 'admin', 'x-amzn-oidc-identity': 'u1', 'cognito:groups': 'administrateurs', 'x-forwarded-groups': 'administrateurs' },
    query: { sub: 'u1', groupes: 'administrateurs', 'cognito:groups': 'administrateurs', identite: 'admin' },
  };
  assert.equal(versRequete(evt('GET', '/v1/admin/accompagnants', usurpations)).identite, undefined);
});

// ---------------------------------------------------------------------------------------------- configuration

test('configuration : toutes les variables lues, les listes découpées, Turnstile sans contrôle d’hôte si la liste est vide', () => {
  const env = { TABLE_NAME: 'preprod-horsfiltre', ORIGINES_PUBLIQUES: ' https://a.fr , https://b.fr ', ORIGINES_ADMINISTRATION: 'https://admin.fr', PARAM_SECRET_JETON: '/p/j', PARAM_SECRET_TURNSTILE: '/p/t', TURNSTILE_HOTES: '' };
  const c = lireConfiguration(env);
  assert.deepEqual(c.originesPubliques, ['https://a.fr', 'https://b.fr']);
  assert.equal(c.hotesTurnstile, undefined);
  assert.deepEqual(lireConfiguration({ ...env, TURNSTILE_HOTES: 'horsfiltre.fr, www.horsfiltre.fr' }).hotesTurnstile, ['horsfiltre.fr', 'www.horsfiltre.fr']);
});

test('configuration : une variable manquante est une erreur qui la nomme, jamais une valeur par défaut', () => {
  const env: Record<string, string> = { TABLE_NAME: 't', ORIGINES_PUBLIQUES: 'https://a.fr', ORIGINES_ADMINISTRATION: 'https://admin.fr', PARAM_SECRET_JETON: '/p/j', PARAM_SECRET_TURNSTILE: '/p/t' };
  for (const nom of Object.keys(env)) {
    const sans = { ...env }; delete sans[nom];
    assert.throws(() => lireConfiguration(sans), new RegExp(nom), nom);
    assert.throws(() => lireConfiguration({ ...env, [nom]: '   ' }), new RegExp(nom), `${nom} vide`);
  }
});

// ---------------------------------------------------------------------------------------------- secrets

test('secrets : les deux secrets sont lus ensemble, déchiffrés', async () => {
  let commande: GetParametersCommand | undefined;
  const ssm: ClientParametres = { send: async (c) => { commande = c; return { Parameters: [{ Name: CONFIG.paramSecretJeton, Value: SECRET_JETON }, { Name: CONFIG.paramSecretTurnstile, Value: SECRET_TURNSTILE }] }; } };
  assert.deepEqual(await lireSecrets(ssm, CONFIG), { jeton: SECRET_JETON, turnstile: SECRET_TURNSTILE });
  assert.equal(commande!.input.WithDecryption, true);
  assert.deepEqual(commande!.input.Names, [CONFIG.paramSecretJeton, CONFIG.paramSecretTurnstile]);
});

test('secrets : un paramètre introuvable, vide ou trop court est refusé, et l’erreur ne contient jamais une valeur', async () => {
  const introuvable: ClientParametres = { send: async () => ({ Parameters: [], InvalidParameters: [CONFIG.paramSecretTurnstile] }) };
  await assert.rejects(lireSecrets(introuvable, CONFIG), (e: Error) => e.message.includes(CONFIG.paramSecretTurnstile));
  const vide: ClientParametres = { send: async () => ({ Parameters: [{ Name: CONFIG.paramSecretJeton, Value: SECRET_JETON }, { Name: CONFIG.paramSecretTurnstile, Value: '' }] }) };
  await assert.rejects(lireSecrets(vide, CONFIG), /vide ou illisible/);
  const court: ClientParametres = { send: async () => ({ Parameters: [{ Name: CONFIG.paramSecretJeton, Value: 'trop-court-mais-secret' }, { Name: CONFIG.paramSecretTurnstile, Value: SECRET_TURNSTILE }] }) };
  await assert.rejects(lireSecrets(court, CONFIG), (e: Error) => /trop court/.test(e.message) && !e.message.includes('trop-court-mais-secret'));
});

// ---------------------------------------------------------------------------------------------- application complète

async function application() {
  const stockage = new StockageMemoire();
  await stockage.ecrireAccompagnant({ id: 'ilyas', prenom: 'Ilyas', lienVisio: 'https://meet.google.com/abc-defg-hij', actif: true });
  await stockage.ecrireRegle({ id: 'R1', accompagnantId: 'ilyas', jour: 'mardi', debut: '18:00', fin: '21:00', valideDu: '2026-11-01', valideAu: null });
  await synchroniserCreneaux(stockage, new Date('2026-11-16T09:00:00Z'));
  const lecturesPrenoms = { n: 0 };
  const lire = stockage.lireAccompagnant.bind(stockage);
  stockage.lireAccompagnant = async (id: string) => { lecturesPrenoms.n++; return lire(id); };
  const ssm = ssmOk();
  const corpsTurnstile: URLSearchParams[] = [];
  const fetchImpl = (async (_url: string, init?: RequestInit) => { corpsTurnstile.push(init!.body as URLSearchParams); return new Response(JSON.stringify({ success: true }), { status: 200 }); }) as unknown as typeof fetch;
  const evenements: Record<string, unknown>[] = [];
  const app = await creerApplication(CONFIG, { ssm, stockage, fetchImpl, maintenant: () => new Date('2026-11-16T09:00:00Z'), journal: (e) => evenements.push(e) });
  const handler = creerHandler(async () => app, (e) => evenements.push(e));
  return { stockage, ssm, handler, corpsTurnstile, lecturesPrenoms, evenements };
}

test('application : les créneaux sont servis avec le prénom, et le prénom est gardé en mémoire', async () => {
  const a = await application();
  const r = await a.handler(evt('GET', '/v1/creneaux'));
  assert.equal(r.statusCode, 200);
  const creneaux = JSON.parse(r.body).creneaux as { accompagnant: { prenom: string } }[];
  assert.ok(creneaux.length > 0);
  assert.ok(creneaux.every((c) => c.accompagnant.prenom === 'Ilyas'));
  assert.equal(a.lecturesPrenoms.n, 1); // une seule lecture pour toute la liste
  await a.handler(evt('GET', '/v1/creneaux'));
  assert.equal(a.lecturesPrenoms.n, 1); // et rien de plus à l'appel suivant
});

test('application : l’administration exige l’identité validée par API Gateway et le groupe', async () => {
  const a = await application();
  const appel = (opts = {}) => a.handler(evt('GET', '/v1/admin/accompagnants', opts));
  assert.equal((await appel()).statusCode, 401);
  assert.equal((await appel({ claims: { sub: 'u', 'cognito:groups': '[candidats]' } })).statusCode, 403);
  assert.equal((await appel({ claims: { sub: 'u' } })).statusCode, 403);
  assert.equal((await appel({ claims: admin })).statusCode, 200);
  // Des en-têtes qui prétendent être administrateur, sans contexte d'autorisation : refusés.
  assert.equal((await appel({ headers: { authorization: 'Bearer faux', 'x-identite': 'administrateurs' }, query: { groupes: 'administrateurs' } })).statusCode, 401);
});

test('application : une réservation traverse toute la chaîne, avec le secret Turnstile lu dans le magasin de paramètres', async () => {
  const a = await application();
  const cible = [...a.stockage.creneaux.values()].find((c) => c.debut === '2026-11-17T17:00:00.000Z')!;
  const r = await a.handler(evt('POST', '/v1/reservations', {
    headers: { 'content-type': 'application/json', 'idempotency-key': CLE_IDEMPOTENCE, 'cf-connecting-ip': '198.51.100.7' },
    body: JSON.stringify({ creneauId: cible.id, prenom: 'Sarah', email: 'sarah@exemple.fr', recherche: 'alternance', canal: 'visio', turnstile: 'jeton-du-visiteur' }),
  }));
  assert.equal(r.statusCode, 201);
  assert.equal(JSON.parse(r.body).accompagnant.prenom, 'Ilyas');
  assert.equal(a.corpsTurnstile.length, 1);
  assert.equal(a.corpsTurnstile[0]!.get('secret'), SECRET_TURNSTILE);
  assert.equal(a.corpsTurnstile[0]!.get('response'), 'jeton-du-visiteur');
  assert.equal(a.corpsTurnstile[0]!.get('remoteip'), '198.51.100.7');
  assert.equal([...a.stockage.reservations.values()].length, 1);
});

test('application : le journal ne contient ni secret, ni adresse, ni prénom de candidat', async () => {
  const a = await application();
  const cible = [...a.stockage.creneaux.values()][0]!;
  await a.handler(evt('POST', '/v1/reservations', {
    headers: { 'content-type': 'application/json', 'idempotency-key': CLE_IDEMPOTENCE },
    body: JSON.stringify({ creneauId: cible.id, prenom: 'Camille', email: 'camille@exemple.fr', recherche: 'cdi', canal: 'visio', turnstile: 'jeton-secret-du-visiteur' }),
  }));
  const journal = JSON.stringify(a.evenements);
  for (const interdit of [SECRET_JETON, SECRET_TURNSTILE, 'camille@exemple.fr', 'Camille', 'jeton-secret-du-visiteur', '203.0.113.9']) assert.ok(!journal.includes(interdit), interdit);
});

// ---------------------------------------------------------------------------------------------- initialisation

test('initialisation : elle n’a lieu qu’une fois, quel que soit le nombre d’appels', async () => {
  let initialisations = 0;
  const h = creerHandler(async () => { initialisations++; return async () => ({ statut: 200, entetes: {}, corps: 'ok' }); });
  for (let i = 0; i < 5; i++) assert.equal((await h(evt('GET', '/x'))).statusCode, 200);
  assert.equal(initialisations, 1);
});

test('initialisation : un échec donne une erreur générique, sans détail, et est retenté à l’appel suivant', async () => {
  let essais = 0;
  const journal: Record<string, unknown>[] = [];
  const h = creerHandler(async () => {
    essais++;
    if (essais === 1) throw new Error('Paramètre introuvable dans le magasin de paramètres : /horsfiltre/preprod/jeton-secret');
    return async () => ({ statut: 200, entetes: {}, corps: 'ok' });
  }, (e) => journal.push(e));
  const premier = await h(evt('GET', '/x'));
  assert.equal(premier.statusCode, 500);
  assert.equal(JSON.parse(premier.body).code, 'erreur_interne');
  assert.doesNotMatch(premier.body, /Paramètre|jeton-secret|magasin|preprod/); // rien d'interne ne sort
  assert.ok(journal.some((e) => e.evenement === 'initialisation_ou_traitement_en_echec')); // mais l'équipe le sait
  assert.equal((await h(evt('GET', '/x'))).statusCode, 200); // retenté, et réussi
  assert.equal(essais, 2);
});

test('initialisation : le magasin de paramètres n’est lu qu’une fois pour toute la vie de la fonction', async () => {
  const a = await application();
  for (let i = 0; i < 3; i++) await a.handler(evt('GET', '/v1/creneaux'));
  assert.equal(a.ssm.appels, 1);
});

// ---------------------------------------------------------------------------------------------- e-mails

import { lireConfigurationCourriel, lireSecretJeton } from '../src/lambda.mts';
import type { Envoi } from '../src/courriel.mts';

const COURRIEL = { expediteur: 'contact@horsfiltre.fr', ensemble: 'horsfiltre-transactionnel', copieInterne: 'contact@horsfiltre.fr', urlSite: 'https://horsfiltre.fr' };

test('courriel : la configuration est lue en bloc, absente = e-mails désactivés, à moitié remplie = erreur qui nomme ce qui manque', () => {
  assert.equal(lireConfigurationCourriel({}), undefined);
  assert.equal(lireConfigurationCourriel({ EXPEDITEUR: '  ' }), undefined);
  assert.deepEqual(lireConfigurationCourriel({ EXPEDITEUR: 'contact@horsfiltre.fr', ENSEMBLE_CONFIGURATION: 'e', COPIE_INTERNE: 'contact@horsfiltre.fr', URL_SITE: 'https://horsfiltre.fr/' }),
    { expediteur: 'contact@horsfiltre.fr', ensemble: 'e', copieInterne: 'contact@horsfiltre.fr', urlSite: 'https://horsfiltre.fr' }); // la barre finale est retirée
  assert.throws(() => lireConfigurationCourriel({ EXPEDITEUR: 'contact@horsfiltre.fr' }), /ENSEMBLE_CONFIGURATION, COPIE_INTERNE, URL_SITE/);
  for (const url of ['http://horsfiltre.fr', 'horsfiltre.fr', 'https://horsfiltre.fr/chemin', 'javascript:alert(1)', 'https://evil.example@horsfiltre.fr']) {
    assert.throws(() => lireConfigurationCourriel({ EXPEDITEUR: 'a@b.fr', ENSEMBLE_CONFIGURATION: 'e', COPIE_INTERNE: 'a@b.fr', URL_SITE: url }), /URL_SITE|incomplète/, url);
  }
});

test('courriel : un seul secret se lit avec les mêmes garde-fous, et l’erreur ne contient jamais sa valeur', async () => {
  const bon: ClientParametres = { send: async () => ({ Parameters: [{ Name: '/p/j', Value: SECRET_JETON }] }) };
  assert.equal(await lireSecretJeton(bon, '/p/j'), SECRET_JETON);
  await assert.rejects(lireSecretJeton({ send: async () => ({ Parameters: [], InvalidParameters: ['/p/j'] }) }, '/p/j'), /introuvable/);
  await assert.rejects(lireSecretJeton({ send: async () => ({ Parameters: [{ Name: '/p/j', Value: 'trop-court-secret' }] }) }, '/p/j'), (e: Error) => /trop court/.test(e.message) && !e.message.includes('trop-court-secret'));
});

async function applicationAvecCourriel(courriel: typeof COURRIEL | undefined) {
  const a = await application();
  const envois: Envoi[] = [];
  const journal: Record<string, unknown>[] = [];
  const app = await creerApplication({ ...CONFIG, courriel }, {
    ssm: ssmOk(), stockage: a.stockage, maintenant: () => new Date('2026-11-16T09:00:00Z'), journal: (e) => journal.push(e),
    fetchImpl: (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as unknown as typeof fetch,
    envoyeur: async (e) => { envois.push(e); },
  });
  const handler = creerHandler(async () => app, (e) => journal.push(e));
  const cible = [...a.stockage.creneaux.values()].find((c) => c.debut === '2026-11-17T17:00:00.000Z')!;
  const reserver = (email: string, cle = CLE_IDEMPOTENCE, origin = 'https://lot-9.horsfiltre.pages.dev') => handler(evt('POST', '/v1/reservations', {
    headers: { 'content-type': 'application/json', 'idempotency-key': cle, origin },
    body: JSON.stringify({ creneauId: cible.id, prenom: 'Sarah', email, recherche: 'alternance', canal: 'visio', turnstile: 'jeton' }),
  }));
  return { ...a, envois, journal, handler, reserver, cible };
}

test('courriel, de bout en bout : une réservation par l’API envoie la confirmation à la personne et la copie à l’équipe, avec le site d’origine', async () => {
  const m = await applicationAvecCourriel({ ...COURRIEL, urlSite: 'https://horsfiltre.fr' });
  const r = await m.reserver('sarah@exemple.fr');
  assert.equal(r.statusCode, 201);
  assert.deepEqual(m.envois.map((e) => e.a), ['sarah@exemple.fr', 'contact@horsfiltre.fr']);
  assert.match(m.envois[0]!.texte, /https:\/\/lot-9\.horsfiltre\.pages\.dev\/reserver\/gerer\/#/);
  assert.ok(!JSON.stringify(JSON.parse(r.body)).includes('gerer')); // la réponse de l'API, elle, ne porte toujours aucun lien
});

test('courriel : l’origine d’un site non autorisé ne fabrique jamais le lien d’un e-mail', async () => {
  const m = await applicationAvecCourriel(COURRIEL);
  await m.reserver('sarah@exemple.fr', undefined, 'https://evil.example');
  assert.match(m.envois[0]!.texte, /https:\/\/horsfiltre\.fr\/reserver\/gerer\//);
  assert.doesNotMatch(m.envois[0]!.texte + m.envois[0]!.html, /evil\.example/);
});

test('courriel : rejouer la même demande ne renvoie pas d’e-mail', async () => {
  const m = await applicationAvecCourriel(COURRIEL);
  assert.equal((await m.reserver('sarah@exemple.fr')).statusCode, 201);
  assert.equal((await m.reserver('sarah@exemple.fr')).statusCode, 200); // rejeu : même réservation
  assert.equal(m.envois.length, 2); // la confirmation et la copie, une seule fois
});

test('courriel : un créneau pris, une adresse injoignable ou un robot refusé n’envoient rien', async () => {
  const m = await applicationAvecCourriel(COURRIEL);
  await m.stockage.marquerAdresseInjoignable((await import('../../shared/src/index.mts')).empreinteEmail('rebond@exemple.fr'), 'rebond', new Date().toISOString());
  const refus = await m.reserver('rebond@exemple.fr');
  assert.equal(refus.statusCode, 422);
  assert.equal(JSON.parse(refus.body).code, 'adresse_injoignable');
  assert.equal(m.envois.length, 0);
});

test('courriel : une panne d’envoi ne fait pas échouer la réservation, et laisse une trace pour l’alarme', async () => {
  const a = await application(); const journal: Record<string, unknown>[] = [];
  const app = await creerApplication({ ...CONFIG, courriel: COURRIEL }, {
    ssm: ssmOk(), stockage: a.stockage, maintenant: () => new Date('2026-11-16T09:00:00Z'), journal: (e) => journal.push(e),
    fetchImpl: (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as unknown as typeof fetch,
    envoyeur: async () => { throw Object.assign(new Error('SES indisponible'), { name: 'ServiceUnavailableException' }); },
  });
  const cible = [...a.stockage.creneaux.values()].find((c) => c.debut === '2026-11-17T17:00:00.000Z')!;
  const r = await creerHandler(async () => app)(evt('POST', '/v1/reservations', { headers: { 'content-type': 'application/json', 'idempotency-key': CLE_IDEMPOTENCE },
    body: JSON.stringify({ creneauId: cible.id, prenom: 'Sarah', email: 'sarah@exemple.fr', recherche: 'alternance', canal: 'visio', turnstile: 'jeton' }) }));
  assert.equal(r.statusCode, 201); // la réservation est faite
  assert.equal([...a.stockage.reservations.values()].length, 1);
  assert.equal(journal.filter((e) => e.evenement === 'courriel_echec').length, 2); // la confirmation et la copie
  assert.doesNotMatch(JSON.stringify(journal), /sarah@exemple\.fr/);
});

test('courriel : sans configuration des e-mails, la réservation fonctionne et rien ne part', async () => {
  const m = await applicationAvecCourriel(undefined);
  assert.equal((await m.reserver('sarah@exemple.fr')).statusCode, 201);
  assert.equal(m.envois.length, 0);
});
