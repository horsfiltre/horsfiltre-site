import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerEtat, creerSession, creerVerificateur, defiDepuis, lireRetour, lireRevendications, urlAutorisation, urlDeconnexion } from '../js/connexion.js';

const CONFIG = { cognito: 'https://x.auth.eu-west-3.amazoncognito.com', clientId: 'client1' };
const jetonDe = (charge) => `e30.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.sig`;

function monde({ reponses = [] } = {}) {
  const stock = new Map();
  const stockage = { setItem: (k, v) => stock.set(k, v), getItem: (k) => stock.get(k) ?? null, removeItem: (k) => stock.delete(k) };
  const lieu = { origin: 'https://admin.horsfiltre.fr', search: '', assignations: [], assign(u) { this.assignations.push(u); } };
  // Comme dans un navigateur : remplacer l'adresse par « / » vide aussi location.search.
  const historique = { remplacements: [], replaceState: (...a) => { historique.remplacements.push(a); lieu.search = ''; } };
  const appels = [];
  const fetchImpl = async (url, init) => {
    appels.push({ url, corps: Object.fromEntries(init.body) });
    // Comme le vrai Cognito : les groupes dans le jeton d'accès, l'adresse seulement dans le jeton d'identité.
    const r = reponses.shift() ?? { statut: 200, corps: { access_token: jetonDe({ 'cognito:groups': ['administrateurs'], username: 'u1' }), id_token: jetonDe({ email: 'a@b.fr', 'cognito:groups': ['administrateurs'] }), refresh_token: 'rafraichir-1', expires_in: 3600 } };
    return new Response(JSON.stringify(r.corps), { status: r.statut });
  };
  return { stock, stockage, lieu, historique, appels, session: creerSession({ config: CONFIG, lieu, historique, stockage, fetchImpl }) };
}
/** Joue la première étape, puis simule le retour de Cognito avec l'état et le code donnés. */
async function seConnecter(m, { code = 'code-1', etat } = {}) {
  assert.equal(await m.session.demarrer(), 'redirige');
  const memoire = JSON.parse(m.stock.get('pkce'));
  m.lieu.search = `?code=${code}&state=${etat ?? memoire.etat}`;
  return memoire;
}

test('connexion : le défi se calcule comme la norme (exemple de la RFC 7636, annexe B)', async () => {
  assert.equal(await defiDepuis('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('connexion : vérificateur et état sont longs, sans caractère interdit, et différents à chaque fois', () => {
  assert.match(creerVerificateur(), /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(creerVerificateur(), creerVerificateur());
  assert.notEqual(creerEtat(), creerEtat());
});

test('connexion : l’adresse de connexion porte le défi et l’état ; celle de déconnexion revient à l’accueil', () => {
  const u = new URL(urlAutorisation({ cognito: CONFIG.cognito + '/', clientId: 'c1', retour: 'https://admin.horsfiltre.fr/', etat: 'e1', defi: 'd1' }));
  assert.equal(u.origin + u.pathname, `${CONFIG.cognito}/oauth2/authorize`);
  assert.deepEqual([u.searchParams.get('response_type'), u.searchParams.get('code_challenge_method'), u.searchParams.get('code_challenge'), u.searchParams.get('state'), u.searchParams.get('scope')], ['code', 'S256', 'd1', 'e1', 'openid email']);
  const d = new URL(urlDeconnexion({ cognito: CONFIG.cognito, clientId: 'c1', retour: 'https://admin.horsfiltre.fr/' }));
  assert.equal(d.pathname, '/logout');
  assert.equal(d.searchParams.get('logout_uri'), 'https://admin.horsfiltre.fr/');
});

test('connexion : le retour est accepté avec le bon état, refusé sinon', () => {
  assert.deepEqual(lireRetour('?code=abc&state=bon', 'bon'), { ok: true, code: 'abc' });
  for (const [recherche, raison] of [['?code=abc&state=autre', 'etat_different'], ['?code=abc', 'etat_different'], ['?code=abc&state=bonX', 'etat_different'], ['?state=bon', 'code_manquant'], ['?error=access_denied&state=bon', 'access_denied']]) {
    assert.deepEqual(lireRetour(recherche, 'bon'), { ok: false, raison }, recherche);
  }
  assert.deepEqual(lireRetour('?code=abc&state=', ''), { ok: false, raison: 'etat_different' }); // un état attendu vide n'est jamais accepté
});

test('session : sans retour de Cognito, la page part vers la connexion, avec un secret à usage unique gardé pour le retour', async () => {
  const m = monde();
  assert.equal(await m.session.demarrer(), 'redirige');
  const u = new URL(m.lieu.assignations[0]);
  const memoire = JSON.parse(m.stock.get('pkce'));
  assert.equal(u.searchParams.get('code_challenge'), await defiDepuis(memoire.verificateur));
  assert.equal(u.searchParams.get('state'), memoire.etat);
  assert.equal(u.searchParams.get('redirect_uri'), 'https://admin.horsfiltre.fr/');
  assert.ok(!m.lieu.assignations[0].includes(memoire.verificateur)); // le vérificateur ne part jamais dans l'adresse
});

test('session : au retour, le code est échangé avec le bon vérificateur, puis effacé de l’adresse et de la mémoire', async () => {
  const m = monde();
  const memoire = await seConnecter(m);
  assert.equal(await m.session.demarrer(), 'connecte');
  assert.deepEqual(m.appels[0].corps, { grant_type: 'authorization_code', client_id: 'client1', code: 'code-1', redirect_uri: 'https://admin.horsfiltre.fr/', code_verifier: memoire.verificateur });
  assert.deepEqual(m.historique.remplacements[0], [{}, '', '/']); // ni le code ni l'état ne restent dans l'historique
  assert.equal(m.stock.has('pkce'), false); // à usage unique
  assert.deepEqual(m.session.revendications().groupes, ['administrateurs']);
  assert.equal(m.session.revendications().courriel, 'a@b.fr'); // lue dans le jeton d'identité, pas dans le jeton d'accès
});

test('session : le jeton ne passe jamais par le stockage du navigateur', async () => {
  const m = monde();
  await seConnecter(m);
  await m.session.demarrer();
  const jeton = await m.session.jeton();
  assert.ok(jeton);
  assert.ok(![...m.stock.values()].some((v) => v.includes(jeton) || v.includes('rafraichir-1')));
  assert.equal(m.stock.size, 0);
});

test('session : un état falsifié, un retour d’erreur ou une connexion interrompue sont refusés sans échanger de code', async () => {
  const a = monde(); await seConnecter(a, { etat: 'etat-pirate' });
  await assert.rejects(a.session.demarrer(), /etat_different/);
  assert.equal(a.appels.length, 0);
  const b = monde(); assert.equal(await b.session.demarrer(), 'redirige'); b.lieu.search = '?error=access_denied';
  await assert.rejects(b.session.demarrer(), /access_denied/);
  const c = monde(); c.lieu.search = '?code=x&state=y'; // aucun secret gardé : un code rejoué ou venu d'ailleurs
  await assert.rejects(c.session.demarrer(), /connexion_interrompue/);
  assert.equal(c.appels.length, 0);
});

test('session : un code déjà utilisé ne peut pas être rejoué', async () => {
  const m = monde();
  await seConnecter(m);
  await m.session.demarrer();
  m.lieu.search = '?code=code-1&state=autre';
  await assert.rejects(m.session.demarrer(), /connexion_interrompue/);
});

test('session : le jeton est renouvelé avant son expiration, et une session perdue repart vers la connexion', async () => {
  const m = monde({ reponses: [
    { statut: 200, corps: { access_token: jetonDe({}), refresh_token: 'r1', expires_in: 30 } }, // expire dans 30 s : déjà « bientôt »
    { statut: 200, corps: { access_token: jetonDe({ renouvele: true }), expires_in: 3600 } },
    { statut: 400, corps: { error: 'invalid_grant' } },
  ] });
  await seConnecter(m); await m.session.demarrer();
  const nouveau = await m.session.jeton(); // renouvelé car trop proche de l'expiration
  assert.equal(m.appels[1].corps.grant_type, 'refresh_token');
  assert.equal(m.appels[1].corps.refresh_token, 'r1');
  assert.ok(nouveau.includes(Buffer.from(JSON.stringify({ renouvele: true })).toString('base64url')));
  assert.equal(await m.session.rafraichir(), false); // le renouvellement suivant est refusé : session perdue
  assert.equal(await m.session.jeton(), undefined);
});

test('session : sans réponse valable de Cognito, aucune session n’est ouverte', async () => {
  const m = monde({ reponses: [{ statut: 400, corps: { error: 'invalid_grant' } }] });
  await seConnecter(m);
  await assert.rejects(m.session.demarrer(), /invalid_grant/);
  assert.equal(await m.session.jeton(), undefined);
});

test('session : se déconnecter efface le jeton et passe par la page de déconnexion de Cognito', async () => {
  const m = monde();
  await seConnecter(m); await m.session.demarrer();
  m.session.deconnecter();
  assert.match(m.lieu.assignations.at(-1), /\/logout\?/);
  assert.equal(await m.session.jeton(), undefined);
});

test('connexion : les groupes et l’adresse d’un jeton se lisent, un jeton illisible donne une liste vide', () => {
  assert.deepEqual(lireRevendications(jetonDe({ 'cognito:groups': ['administrateurs'], email: 'a@b.fr' })), { groupes: ['administrateurs'], courriel: 'a@b.fr' });
  assert.deepEqual(lireRevendications(jetonDe({ 'cognito:groups': ['candidats'] })).groupes, ['candidats']);
  assert.deepEqual(lireRevendications(jetonDe({})).groupes, []);
  assert.deepEqual(lireRevendications(jetonDe({ 'cognito:groups': 'administrateurs' })).groupes, []);
  assert.deepEqual(lireRevendications('pas-un-jeton'), { groupes: [] });
});
