import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { StockageMemoire, genererCreneaux, type Creneau, type Regle } from '../../shared/src/index.mts';
import { creerGestionnaire, type DependancesHttp, type Requete, type Reponse } from '../src/http.mts';
import type { VerificationTurnstile } from '../src/turnstile.mts';

const LUNDI = new Date('2026-11-16T09:00:00Z');
const regle: Regle = { id: 'R1', accompagnantId: 'ilyas', jour: 'mardi', debut: '18:00', fin: '21:00', valideDu: '2026-11-01' };
const ORIGINES = ['https://horsfiltre.fr', 'https://www.horsfiltre.fr', 'https://*.horsfiltre.pages.dev'];

async function monde(surcharges: Partial<DependancesHttp> = {}) {
  const stockage = new StockageMemoire();
  const creneaux = genererCreneaux({ regles: [regle], absences: [], depuis: '2026-11-16', jusqua: '2026-12-08' });
  await stockage.ecrireCreneaux(creneaux);
  const etat = { maintenant: LUNDI, turnstile: 'ok' as VerificationTurnstile, appelsTurnstile: 0, evenements: [] as Record<string, unknown>[], apres: [] as string[] };
  const gestionnaire = creerGestionnaire({
    stockage,
    maintenant: () => etat.maintenant,
    secretJeton: 'secret-de-test-assez-long',
    verifierTurnstile: async () => { etat.appelsTurnstile++; return etat.turnstile; },
    prenomDe: async (id) => (id === 'ilyas' ? 'Ilyas' : 'Inconnu'),
    originesAutorisees: ORIGINES,
    apresReservation: async ({ jeton }) => { etat.apres.push(`reservation:${jeton}`); },
    apresAnnulation: async () => { etat.apres.push('annulation'); },
    apresReport: async () => { etat.apres.push('report'); },
    journal: (e) => etat.evenements.push(e),
    ...surcharges,
  });
  const appeler = (r: Partial<Requete> & { methode: string; chemin: string }): Promise<Reponse> =>
    gestionnaire({ requete: {}, entetes: {}, corps: null, idRequete: 'req-1', ...r });
  const post = (chemin: string, corps: unknown, extra: Partial<Requete> = {}, cle: string | null = randomUUID()) =>
    appeler({ methode: 'POST', chemin, corps: typeof corps === 'string' ? corps : JSON.stringify(corps),
      entetes: { 'content-type': 'application/json', ...(cle ? { 'idempotency-key': cle } : {}), ...extra.entetes }, ...extra, ...(extra.entetes ? { entetes: { 'content-type': 'application/json', ...(cle ? { 'idempotency-key': cle } : {}), ...extra.entetes } } : {}) });
  const demande = (c: Creneau, extra: Record<string, unknown> = {}) => ({
    creneauId: c.id, prenom: 'Sarah', email: 'sarah@exemple.fr', recherche: 'alternance', canal: 'visio', turnstile: 'jeton-turnstile', ...extra,
  });
  const lire = (r: Reponse) => JSON.parse(r.corps) as Record<string, any>;
  // Mardi 17 novembre à 18 h : dans 32 h, donc réservable.
  const cible = creneaux.find((c) => c.debut === '2026-11-17T17:00:00.000Z')!;
  const autre = creneaux.find((c) => c.debut === '2026-11-24T17:00:00.000Z')!;
  const reserver = async (c = cible, extra: Record<string, unknown> = {}) => {
    const r = await post('/v1/reservations', demande(c, extra));
    assert.equal(r.statut, 201, r.corps);
    const jeton = etat.apres.find((a) => a.startsWith('reservation:'))!.slice('reservation:'.length);
    return { id: lire(r).id as string, jeton };
  };
  return { stockage, creneaux, etat, appeler, post, demande, lire, cible, autre, reserver };
}

// ---------------------------------------------------------------------------------------------- créneaux

test('GET /v1/creneaux : la fenêtre de réservation, avec le prénom, sans mise en cache', async () => {
  const m = await monde();
  const r = await m.appeler({ methode: 'GET', chemin: '/v1/creneaux' });
  assert.equal(r.statut, 200);
  assert.equal(r.entetes['cache-control'], 'no-store');
  assert.equal(r.entetes['x-content-type-options'], 'nosniff');
  const corps = m.lire(r);
  assert.equal(corps.fuseau, 'Europe/Paris');
  assert.ok(corps.creneaux.length > 0);
  assert.equal(corps.creneaux[0].accompagnant.prenom, 'Ilyas');
  assert.equal(corps.creneaux[0].disponible, true);
  // Le premier créneau visible est le mardi 17 : plus de 12 h après lundi 10 h.
  assert.equal(corps.creneaux[0].debut, '2026-11-17T17:00:00.000Z');
});

test('GET /v1/creneaux : une période demandée restreint la liste ; un créneau pris reste visible, désactivé', async () => {
  const m = await monde();
  await m.reserver();
  const r = await m.appeler({ methode: 'GET', chemin: '/v1/creneaux', requete: { du: '2026-11-17', au: '2026-11-17' } });
  const creneaux = m.lire(r).creneaux as { debut: string; disponible: boolean }[];
  assert.ok(creneaux.every((c) => c.debut.startsWith('2026-11-17')));
  assert.equal(creneaux.find((c) => c.debut === '2026-11-17T17:00:00.000Z')!.disponible, false);
  assert.equal(creneaux.length, 4);
});

test('GET /v1/creneaux : des dates mal formées ou inversées sont refusées', async () => {
  const m = await monde();
  assert.equal((await m.appeler({ methode: 'GET', chemin: '/v1/creneaux', requete: { du: '17/11/2026' } })).statut, 400);
  assert.equal((await m.appeler({ methode: 'GET', chemin: '/v1/creneaux', requete: { du: '2026-11-20', au: '2026-11-17' } })).statut, 400);
});

// ---------------------------------------------------------------------------------------------- réserver

test('POST /v1/reservations : une réservation valide donne 201, sans adresse ni jeton dans la réponse', async () => {
  const m = await monde();
  const r = await m.post('/v1/reservations', m.demande(m.cible));
  assert.equal(r.statut, 201);
  const corps = m.lire(r);
  assert.deepEqual(Object.keys(corps).sort(), ['accompagnant', 'canal', 'debut', 'fin', 'id', 'statut']);
  assert.deepEqual(corps.accompagnant, { prenom: 'Ilyas' });
  assert.equal(corps.statut, 'confirmee');
  assert.doesNotMatch(r.corps, /sarah@exemple\.fr|jeton/);
  assert.equal(m.etat.apres.length, 1); // le lien d'annulation part vers l'e-mail, pas vers la réponse
});

test('POST /v1/reservations : les champs invalides donnent 422, un message par champ, sans consulter Turnstile', async () => {
  const m = await monde();
  const r = await m.post('/v1/reservations', { creneauId: 'x', email: 'pas-un-email', canal: 'whatsapp' });
  assert.equal(r.statut, 422);
  assert.equal(r.entetes['content-type'], 'application/problem+json; charset=utf-8');
  const corps = m.lire(r);
  assert.equal(corps.code, 'donnees_invalides');
  assert.equal(corps.erreurs.prenom, 'Indiquez votre prénom.');
  assert.ok(corps.erreurs.email && corps.erreurs.recherche && corps.erreurs.whatsapp && corps.erreurs.creneauId);
  assert.equal(m.etat.appelsTurnstile, 0);
});

test('POST /v1/reservations : l’en-tête Idempotency-Key, le type et le corps sont contrôlés', async () => {
  const m = await monde();
  assert.equal((await m.post('/v1/reservations', m.demande(m.cible), {}, null)).statut, 400);
  assert.equal((await m.post('/v1/reservations', m.demande(m.cible), {}, 'pas-un-uuid')).statut, 400);
  assert.equal((await m.post('/v1/reservations', '{pas du json')).statut, 400);
  assert.equal((await m.post('/v1/reservations', m.demande(m.cible), { entetes: { 'content-type': 'text/plain' } })).statut, 415);
  assert.equal((await m.post('/v1/reservations', m.demande(m.cible, { motivation: 'x'.repeat(9000) }))).statut, 413);
  assert.equal((await m.post('/v1/reservations', 'null')).statut, 422);
});

test('POST /v1/reservations : un jeton anti-robot refusé donne 422, indisponible donne 503, et rien n’est réservé', async () => {
  const m = await monde();
  m.etat.turnstile = 'invalide';
  const refus = await m.post('/v1/reservations', m.demande(m.cible));
  assert.equal(refus.statut, 422);
  assert.equal(m.lire(refus).code, 'turnstile_invalide');
  m.etat.turnstile = 'indisponible';
  const panne = await m.post('/v1/reservations', m.demande(m.cible));
  assert.equal(panne.statut, 503);
  assert.equal(panne.entetes['retry-after'], '5');
  assert.equal((await m.stockage.lireCreneau(m.cible.id))!.statut, 'libre');
});

test('POST /v1/reservations : un créneau pris donne 409, un créneau inconnu 422, une deuxième réservation de la même adresse 409', async () => {
  const m = await monde();
  await m.reserver(m.cible);
  const pris = await m.post('/v1/reservations', m.demande(m.cible, { email: 'autre@exemple.fr' }));
  assert.equal(pris.statut, 409);
  assert.equal(m.lire(pris).code, 'creneau_indisponible');
  const inconnu = await m.post('/v1/reservations', m.demande({ ...m.cible, id: '0'.repeat(26) }, { email: 'x@exemple.fr' }));
  assert.equal(inconnu.statut, 422);
  assert.ok(m.lire(inconnu).erreurs.creneauId);
  const double = await m.post('/v1/reservations', m.demande(m.autre));
  assert.equal(double.statut, 409);
  assert.equal(m.lire(double).code, 'trop_de_reservations');
});

test('POST /v1/reservations : rejouer la demande avec la même clé rend la même réservation, sans Turnstile ni doublon', async () => {
  const m = await monde();
  const cle = randomUUID();
  const premiere = await m.post('/v1/reservations', m.demande(m.cible), {}, cle);
  assert.equal(premiere.statut, 201);
  const appelsApres1 = m.etat.appelsTurnstile;
  m.etat.turnstile = 'invalide'; // le jeton est à usage unique : une seconde vérification échouerait
  const rejeu = await m.post('/v1/reservations', m.demande(m.cible), {}, cle);
  assert.equal(rejeu.statut, 200);
  assert.equal(rejeu.entetes['idempotent-replayed'], 'true');
  assert.equal(m.lire(rejeu).id, m.lire(premiere).id);
  assert.equal(m.etat.appelsTurnstile, appelsApres1);
  assert.equal(m.etat.apres.length, 1); // un seul e-mail
  assert.equal([...m.stockage.reservations.values()].length, 1);
});

test('POST /v1/reservations : la même clé et le même créneau, mais une autre adresse, ne rend jamais la réservation d’autrui', async () => {
  const m = await monde();
  const cle = randomUUID();
  const premiere = await m.post('/v1/reservations', m.demande(m.cible), {}, cle);
  assert.equal(premiere.statut, 201);
  const autre = await m.post('/v1/reservations', m.demande(m.cible, { email: 'intrus@exemple.fr' }), {}, cle);
  assert.equal(autre.statut, 409);
  assert.doesNotMatch(autre.corps, new RegExp(m.lire(premiere).id));
});

test('POST /v1/reservations : la même clé avec un autre créneau n’est pas un rejeu', async () => {
  const m = await monde();
  const cle = randomUUID();
  await m.post('/v1/reservations', m.demande(m.cible), {}, cle);
  const autre = await m.post('/v1/reservations', m.demande(m.autre, { email: 'autre@exemple.fr' }), {}, cle);
  assert.notEqual(autre.statut, 200);
});

test('POST /v1/reservations : cinq demandes simultanées du même créneau, une seule aboutit', async () => {
  const m = await monde();
  const resultats = await Promise.all([1, 2, 3, 4, 5].map((i) => m.post('/v1/reservations', m.demande(m.cible, { email: `p${i}@exemple.fr` }))));
  assert.deepEqual(resultats.map((r) => r.statut).sort(), [201, 409, 409, 409, 409]);
});

// ---------------------------------------------------------------------------------------------- consulter, annuler, reporter

test('GET /v1/reservations/{id} : le lien donne la réservation ; un autre identifiant, un faux lien ou un lien expiré, 403', async () => {
  const m = await monde();
  const { id, jeton } = await m.reserver();
  const ok = await m.appeler({ methode: 'GET', chemin: `/v1/reservations/${id}`, requete: { jeton } });
  assert.equal(ok.statut, 200);
  assert.equal(m.lire(ok).id, id);
  const autreId = (await m.appeler({ methode: 'GET', chemin: `/v1/reservations/${'Z'.repeat(26)}`, requete: { jeton } })).statut;
  assert.equal(autreId, 403); // le lien d'une réservation ne vaut pas pour une autre
  assert.equal((await m.appeler({ methode: 'GET', chemin: `/v1/reservations/${id}`, requete: { jeton: jeton + 'x' } })).statut, 403);
  assert.equal((await m.appeler({ methode: 'GET', chemin: `/v1/reservations/${id}`, requete: {} })).statut, 403);
  m.etat.maintenant = new Date('2026-11-19T17:30:00Z'); // plus de 24 h après le début
  const expire = await m.appeler({ methode: 'GET', chemin: `/v1/reservations/${id}`, requete: { jeton } });
  assert.equal(expire.statut, 403);
  assert.equal(m.lire(expire).code, 'jeton_expire');
});

test('POST /v1/reservations/{id}/annulation : libère le créneau ; une seconde annulation, 409', async () => {
  const m = await monde();
  const { id, jeton } = await m.reserver();
  const r = await m.appeler({ methode: 'POST', chemin: `/v1/reservations/${id}/annulation`, requete: { jeton } });
  assert.equal(r.statut, 200);
  assert.equal(m.lire(r).statut, 'annulee');
  assert.equal((await m.stockage.lireCreneau(m.cible.id))!.statut, 'libre');
  assert.equal(m.etat.apres.at(-1), 'annulation');
  const encore = await m.appeler({ methode: 'POST', chemin: `/v1/reservations/${id}/annulation`, requete: { jeton } });
  assert.equal(encore.statut, 409);
  assert.equal(m.lire(encore).code, 'reservation_deja_annulee');
});

test('POST /v1/reservations/{id}/annulation : un échange commencé ne s’annule plus', async () => {
  const m = await monde();
  const { id, jeton } = await m.reserver();
  m.etat.maintenant = new Date('2026-11-17T17:10:00Z');
  const r = await m.appeler({ methode: 'POST', chemin: `/v1/reservations/${id}/annulation`, requete: { jeton } });
  assert.equal(r.statut, 409);
  assert.equal(m.lire(r).code, 'reservation_passee');
});

test('POST /v1/reservations/{id}/report : prend le nouveau créneau, libère l’ancien ; refusé si le nouveau est pris', async () => {
  const m = await monde();
  const { id, jeton } = await m.reserver();
  const r = await m.post(`/v1/reservations/${id}/report`, { creneauId: m.autre.id }, { requete: { jeton } });
  assert.equal(r.statut, 200);
  assert.equal(m.lire(r).debut, m.autre.debut);
  assert.equal((await m.stockage.lireCreneau(m.cible.id))!.statut, 'libre');
  assert.equal(m.etat.apres.at(-1), 'report');

  // Une autre personne prend le créneau d'origine : le report vers ce créneau est refusé.
  await m.post('/v1/reservations', m.demande(m.cible, { email: 'autre@exemple.fr' }));
  const pris = await m.post(`/v1/reservations/${id}/report`, { creneauId: m.cible.id }, { requete: { jeton } });
  assert.equal(pris.statut, 409);
});

test('POST /v1/reservations/{id}/report : reporter vers son propre créneau est un rejeu, pas une erreur', async () => {
  const m = await monde();
  const { id, jeton } = await m.reserver();
  const r = await m.post(`/v1/reservations/${id}/report`, { creneauId: m.cible.id }, { requete: { jeton } });
  assert.equal(r.statut, 200);
  assert.equal(r.entetes['idempotent-replayed'], 'true');
});

test('POST /v1/reservations/{id}/report : identifiant de créneau invalide, clé d’idempotence absente, faux lien', async () => {
  const m = await monde();
  const { id, jeton } = await m.reserver();
  assert.equal((await m.post(`/v1/reservations/${id}/report`, { creneauId: 'x' }, { requete: { jeton } })).statut, 422);
  assert.equal((await m.post(`/v1/reservations/${id}/report`, { creneauId: m.autre.id }, { requete: { jeton } }, null)).statut, 400);
  assert.equal((await m.post(`/v1/reservations/${id}/report`, { creneauId: m.autre.id }, { requete: { jeton: 'faux' } })).statut, 403);
});

// ---------------------------------------------------------------------------------------------- transversal

test('CORS : les origines autorisées sont reconnues, les autres non, y compris les imitations', async () => {
  const m = await monde();
  const avec = async (origin: string) => (await m.appeler({ methode: 'GET', chemin: '/v1/creneaux', entetes: { origin } })).entetes['access-control-allow-origin'];
  assert.equal(await avec('https://horsfiltre.fr'), 'https://horsfiltre.fr');
  assert.equal(await avec('https://www.horsfiltre.fr'), 'https://www.horsfiltre.fr');
  assert.equal(await avec('https://refonte-accueil-pulse.horsfiltre.pages.dev'), 'https://refonte-accueil-pulse.horsfiltre.pages.dev');
  for (const mauvaise of ['https://evil.com', 'http://horsfiltre.fr', 'https://horsfiltre.fr.evil.com', 'https://evil.com/.horsfiltre.pages.dev', 'https://a.b.horsfiltre.pages.dev', 'https://horsfiltre.pages.dev.evil.com',
    // Imitations où le point du motif serait pris pour « n'importe quel caractère » : n'importe qui peut créer ces noms.
    'https://evil-horsfiltre.pages.dev', 'https://evilxhorsfiltre.pages.dev', 'https://horsfiltreXfr', 'https://horsfiltre-fr', 'https://wwwXhorsfiltre.fr']) {
    assert.equal(await avec(mauvaise), undefined, mauvaise);
  }
  assert.equal((await m.appeler({ methode: 'GET', chemin: '/v1/creneaux' })).entetes['access-control-allow-origin'], undefined);
});

test('CORS : un motif à plusieurs étoiles les remplace toutes, et chacune ne désigne qu’un sous-domaine', async () => {
  const m = await monde({ originesAutorisees: ['https://*.*.exemple.fr'] });
  const avec = async (origin: string) => (await m.appeler({ methode: 'GET', chemin: '/v1/creneaux', entetes: { origin } })).entetes['access-control-allow-origin'];
  assert.equal(await avec('https://a.b.exemple.fr'), 'https://a.b.exemple.fr');
  assert.equal(await avec('https://a-1.b-2.exemple.fr'), 'https://a-1.b-2.exemple.fr');
  for (const mauvaise of ['https://a.exemple.fr', 'https://a.b.c.exemple.fr', 'https://a..exemple.fr', 'https://a.b.exempleXfr', 'https://*.*.exemple.fr', 'https://a/b.c.exemple.fr']) {
    assert.equal(await avec(mauvaise), undefined, mauvaise);
  }
});

test('CORS : la requête préalable est acceptée pour une origine autorisée, refusée sinon', async () => {
  const m = await monde();
  const ok = await m.appeler({ methode: 'OPTIONS', chemin: '/v1/reservations', entetes: { origin: 'https://horsfiltre.fr' } });
  assert.equal(ok.statut, 204);
  assert.match(ok.entetes['access-control-allow-headers']!, /idempotency-key/);
  assert.equal((await m.appeler({ methode: 'OPTIONS', chemin: '/v1/reservations', entetes: { origin: 'https://evil.com' } })).statut, 403);
});

test('une route inconnue donne 404, une méthode non permise 405 avec la liste des méthodes', async () => {
  const m = await monde();
  assert.equal((await m.appeler({ methode: 'GET', chemin: '/v1/admin/tout' })).statut, 404);
  const r = await m.appeler({ methode: 'DELETE', chemin: '/v1/creneaux' });
  assert.equal(r.statut, 405);
  assert.equal(r.entetes.allow, 'GET, OPTIONS');
});

test('une erreur interne ne laisse sortir aucun détail, et est journalisée sans donnée personnelle', async () => {
  const m = await monde({ stockage: { ...new StockageMemoire(), listerCreneaux: async () => { throw new Error('connexion à la base : mot de passe secret-db-123'); } } as never });
  const r = await m.appeler({ methode: 'GET', chemin: '/v1/creneaux' });
  assert.equal(r.statut, 500);
  assert.doesNotMatch(r.corps, /secret-db-123|connexion/);
  assert.equal(m.lire(r).code, 'erreur_interne');
});

test('le journal ne contient ni adresse e-mail, ni prénom, ni lien d’annulation', async () => {
  const m = await monde();
  const { id, jeton } = await m.reserver(m.cible, { motivation: 'texte libre confidentiel' });
  await m.appeler({ methode: 'GET', chemin: `/v1/reservations/${id}`, requete: { jeton } });
  await m.post('/v1/reservations', m.demande(m.autre));
  const journal = JSON.stringify(m.etat.evenements);
  assert.ok(m.etat.evenements.length >= 3);
  for (const interdit of ['sarah@exemple.fr', 'Sarah', jeton, 'confidentiel', 'jeton-turnstile']) assert.ok(!journal.includes(interdit), interdit);
});

test('un effet après réservation qui échoue ne fait pas échouer la réservation, mais est journalisé', async () => {
  const m = await monde({ apresReservation: async () => { throw new Error('file indisponible'); } });
  const r = await m.post('/v1/reservations', m.demande(m.cible));
  assert.equal(r.statut, 201);
  assert.ok(m.etat.evenements.some((e) => e.evenement === 'effet_apres_requete_en_echec'));
});

test('CORS : la page peut lire Retry-After et Idempotent-Replayed, sans quoi elle ne saurait ni quand réessayer ni qu’une réservation est rejouée', async () => {
  const m = await monde();
  const origin = { origin: 'https://lot-8.horsfiltre.pages.dev' };
  m.etat.turnstile = 'indisponible';
  const indispo = await m.post('/v1/reservations', m.demande(m.cible), { entetes: origin });
  assert.equal(indispo.statut, 503);
  assert.equal(indispo.entetes['retry-after'], '5');
  const exposes = (indispo.entetes['access-control-expose-headers'] ?? '').split(',').map((x) => x.trim());
  assert.ok(exposes.includes('retry-after') && exposes.includes('idempotent-replayed'), String(exposes));
  // Une origine non autorisée ne reçoit ni l'autorisation, ni la liste des en-têtes exposés.
  const autre = await m.post('/v1/reservations', m.demande(m.cible), { entetes: { origin: 'https://evil.example' } });
  assert.equal(autre.entetes['access-control-expose-headers'], undefined);
});
