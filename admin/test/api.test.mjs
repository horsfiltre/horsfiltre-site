import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerClient, ErreurApi, messageErreur } from '../js/api.js';

const reponse = (statut, corps) => new Response(corps === undefined ? null : typeof corps === 'string' ? corps : JSON.stringify(corps), { status: statut });
function client(reponses, { rafraichir = async () => false } = {}) {
  const appels = [];
  let jeton = 'jeton-1';
  const api = creerClient({
    base: 'https://api.exemple.fr/', jeton: async () => jeton, rafraichir: async () => { const ok = await rafraichir(); if (ok) jeton = 'jeton-2'; return ok; },
    fetchImpl: async (url, init) => { appels.push({ url: String(url), methode: init.method, entetes: init.headers, corps: init.body }); return reponses.shift(); },
  });
  return { api, appels };
}

test('api : le jeton part dans l’en-tête, les paramètres dans l’adresse, le corps en JSON', async () => {
  const { api, appels } = client([reponse(200, [1]), reponse(201, { id: 'x' })]);
  assert.deepEqual(await api.get('/v1/admin/creneaux', { du: '2026-11-10', au: '2026-11-12' }), [1]);
  assert.equal(appels[0].url, 'https://api.exemple.fr/v1/admin/creneaux?du=2026-11-10&au=2026-11-12');
  assert.equal(appels[0].entetes.authorization, 'Bearer jeton-1');
  assert.equal(appels[0].entetes['content-type'], undefined);
  await api.post('/v1/admin/regles', { jour: 'mardi' });
  assert.equal(appels[1].entetes['content-type'], 'application/json');
  assert.equal(appels[1].corps, '{"jour":"mardi"}');
});

test('api : une réponse 204 donne null', async () => {
  const { api } = client([reponse(204)]);
  assert.equal(await api.supprimer('/v1/admin/regles/ID'), null);
});

test('api : un refus d’identité renouvelle le jeton et rejoue la requête une seule fois', async () => {
  const { api, appels } = client([reponse(401, { message: 'Unauthorized' }), reponse(200, ['ok'])], { rafraichir: async () => true });
  assert.deepEqual(await api.get('/v1/admin/accompagnants'), ['ok']);
  assert.deepEqual(appels.map((a) => a.entetes.authorization), ['Bearer jeton-1', 'Bearer jeton-2']);
});

test('api : si le renouvellement échoue, ou si le second essai échoue aussi, l’erreur 401 remonte sans boucle', async () => {
  const a = client([reponse(401, { message: 'Unauthorized' })]);
  await assert.rejects(a.api.get('/x'), (e) => e instanceof ErreurApi && e.statut === 401);
  assert.equal(a.appels.length, 1);
  const b = client([reponse(401, '{}'), reponse(401, '{}'), reponse(200, [])], { rafraichir: async () => true });
  await assert.rejects(b.api.get('/x'), (e) => e.statut === 401);
  assert.equal(b.appels.length, 2); // jamais de troisième essai
});

test('api : une erreur de l’API garde son statut, son code et le détail champ par champ', async () => {
  const { api } = client([reponse(422, { code: 'donnees_invalides', title: 'Certaines informations sont à corriger.', erreurs: { fin: 'La plage doit durer au moins 30 minutes.' } })]);
  await assert.rejects(api.post('/v1/admin/regles', {}), (e) => {
    assert.equal(e.statut, 422); assert.equal(e.code, 'donnees_invalides'); assert.deepEqual(e.erreurs, { fin: 'La plage doit durer au moins 30 minutes.' });
    assert.equal(messageErreur(e), 'Certaines informations sont à corriger. La plage doit durer au moins 30 minutes.');
    return true;
  });
});

test('api : un corps qui n’est pas du JSON, ou vide, donne quand même une erreur lisible', async () => {
  const a = client([reponse(502, '<html>Bad gateway</html>')]);
  await assert.rejects(a.api.get('/x'), (e) => e.statut === 502 && e.message === 'Erreur 502');
  assert.equal(messageErreur(new TypeError('Failed to fetch')), "Une erreur s'est produite. Réessayez dans un instant.");
});

test('api : une lecture sans réponse lisible (réseau, ou refus de la passerelle sans CORS) renouvelle le jeton et se rejoue une fois', async () => {
  const appels = [];
  let essais = 0;
  const api = creerClient({
    base: 'https://api.exemple.fr', jeton: async () => 'jeton', rafraichir: async () => true,
    fetchImpl: async (url) => { appels.push(String(url)); if (++essais === 1) throw new TypeError('Failed to fetch'); return reponse(200, ['ok']); },
  });
  assert.deepEqual(await api.get('/v1/admin/accompagnants'), ['ok']);
  assert.equal(appels.length, 2);
});

test('api : une écriture sans réponse lisible n’est jamais rejouée : elle pourrait être doublée', async () => {
  let essais = 0;
  const api = creerClient({ base: 'https://api.exemple.fr', jeton: async () => 'jeton', rafraichir: async () => true, fetchImpl: async () => { essais++; throw new TypeError('Failed to fetch'); } });
  for (const ecrire of [() => api.post('/v1/admin/regles', {}), () => api.patch('/v1/admin/creneaux/X', {}), () => api.supprimer('/v1/admin/regles/X')]) {
    await assert.rejects(ecrire(), (e) => e instanceof ErreurApi && e.statut === 0 && e.code === 'reseau' && /Impossible de joindre/.test(messageErreur(e)));
  }
  assert.equal(essais, 3); // une tentative par écriture, aucune de plus
});

test('api : une lecture qui échoue encore après le renouvellement, ou sans renouvellement possible, donne l’erreur réseau', async () => {
  const toujours = creerClient({ base: 'https://api.exemple.fr', jeton: async () => 'j', rafraichir: async () => true, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(toujours.get('/x'), (e) => e.statut === 0 && e.code === 'reseau');
  const sans = creerClient({ base: 'https://api.exemple.fr', jeton: async () => 'j', rafraichir: async () => false, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(sans.get('/x'), (e) => e.statut === 0 && e.code === 'reseau');
});
