import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerEtat, creerVerificateur, defiDepuis, lireRetour, lireRevendications, urlAutorisation } from '../src/pkce.mts';

test('pkce : le défi se calcule comme la norme (exemple de la RFC 7636, annexe B)', () => {
  assert.equal(defiDepuis('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('pkce : le vérificateur est long, sans caractère interdit, et différent à chaque fois', () => {
  const v = creerVerificateur();
  assert.match(v, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(v, creerVerificateur());
  assert.notEqual(creerEtat(), creerEtat());
});

test('pkce : l’adresse de connexion porte le défi et l’état, jamais le vérificateur', () => {
  const verificateur = creerVerificateur();
  const url = urlAutorisation({ adresseConnexion: 'https://x.auth.eu-west-3.amazoncognito.com/', idClient: 'client1', urlRetour: 'http://localhost:8788/connexion', etat: 'etat-1', defi: defiDepuis(verificateur) });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://x.auth.eu-west-3.amazoncognito.com/oauth2/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), defiDepuis(verificateur));
  assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:8788/connexion');
  assert.equal(u.searchParams.get('state'), 'etat-1');
  assert.equal(u.searchParams.get('scope'), 'openid email');
  assert.ok(!url.includes(verificateur));
});

test('pkce : le retour est accepté avec le bon état, refusé avec un autre, une erreur, ou sans code', () => {
  assert.deepEqual(lireRetour('/connexion?code=abc&state=bon', 'bon'), { ok: true, code: 'abc' });
  assert.deepEqual(lireRetour('/connexion?code=abc&state=autre', 'bon'), { ok: false, raison: 'etat_different' });
  assert.deepEqual(lireRetour('/connexion?code=abc', 'bon'), { ok: false, raison: 'etat_different' });
  assert.deepEqual(lireRetour('/connexion?state=bon', 'bon'), { ok: false, raison: 'code_manquant' });
  assert.deepEqual(lireRetour('/connexion?code=abc&state=bon&error=access_denied', 'bon'), { ok: false, raison: 'access_denied' });
  assert.deepEqual(lireRetour('/connexion?code=abc&state=bonX', 'bon'), { ok: false, raison: 'etat_different' }); // longueur différente
});

test('pkce : les groupes et la durée restante d’un jeton se lisent, et un jeton illisible donne une liste vide', () => {
  const charge = Buffer.from(JSON.stringify({ 'cognito:groups': ['administrateurs'], exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const r = lireRevendications(`entete.${charge}.signature`);
  assert.deepEqual(r.groupes, ['administrateurs']);
  assert.ok(r.expireDansMinutes! >= 59 && r.expireDansMinutes! <= 60);
  // Un jeton d'un autre groupe, ou sans groupe, ne doit jamais s'afficher comme administrateur : c'est ce qui permet de comprendre un refus.
  const jetonDe = (revendications: object) => `entete.${Buffer.from(JSON.stringify(revendications)).toString('base64url')}.signature`;
  assert.deepEqual(lireRevendications(jetonDe({ 'cognito:groups': ['candidats'] })).groupes, ['candidats']);
  assert.deepEqual(lireRevendications(jetonDe({ 'cognito:groups': ['administrateurs', 'candidats'] })).groupes, ['administrateurs', 'candidats']);
  assert.deepEqual(lireRevendications(jetonDe({ sub: 'u1' })).groupes, []);
  assert.deepEqual(lireRevendications(jetonDe({ 'cognito:groups': 'administrateurs' })).groupes, []); // forme inattendue : rien d'inventé
  assert.deepEqual(lireRevendications('pas-un-jeton'), { groupes: [] });
  assert.deepEqual(lireRevendications(`a.${Buffer.from('{pas du json').toString('base64url')}.c`), { groupes: [] });
});
