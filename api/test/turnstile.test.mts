import { test } from 'node:test';
import assert from 'node:assert/strict';
import { URL_VERIFICATION, creerVerificateurTurnstile } from '../src/turnstile.mts';

type Appel = { url: string; methode?: string; corps: URLSearchParams };

/** Un faux `fetch` qui note ce qu'on lui envoie et rend la réponse choisie. */
function faux(reponse: () => Promise<Response>) {
  const appels: Appel[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    appels.push({ url, methode: init?.method, corps: init?.body as URLSearchParams });
    return reponse();
  }) as unknown as typeof fetch;
  return { appels, fetchImpl };
}
const succes = (donnees: Record<string, unknown>) => async () => new Response(JSON.stringify(donnees), { status: 200 });

test('Turnstile : un jeton valide est accepté, et la demande part en POST avec le secret, le jeton et l’adresse IP', async () => {
  const f = faux(succes({ success: true, hostname: 'horsfiltre.fr' }));
  const verifier = creerVerificateurTurnstile({ secret: 'secret-de-test', fetchImpl: f.fetchImpl });
  assert.equal(await verifier('jeton-du-visiteur', '203.0.113.7'), 'ok');
  assert.equal(f.appels.length, 1);
  assert.equal(f.appels[0]!.url, URL_VERIFICATION);
  assert.equal(f.appels[0]!.methode, 'POST');
  assert.equal(f.appels[0]!.corps.get('secret'), 'secret-de-test');
  assert.equal(f.appels[0]!.corps.get('response'), 'jeton-du-visiteur');
  assert.equal(f.appels[0]!.corps.get('remoteip'), '203.0.113.7');
});

test('Turnstile : sans adresse IP, le champ n’est pas envoyé', async () => {
  const f = faux(succes({ success: true }));
  await creerVerificateurTurnstile({ secret: 's', fetchImpl: f.fetchImpl })('jeton');
  assert.equal(f.appels[0]!.corps.has('remoteip'), false);
});

test('Turnstile : un jeton refusé, périmé ou déjà utilisé est « invalide »', async () => {
  const f = faux(succes({ success: false, 'error-codes': ['timeout-or-duplicate'] }));
  assert.equal(await creerVerificateurTurnstile({ secret: 's', fetchImpl: f.fetchImpl })('jeton'), 'invalide');
});

test('Turnstile : un jeton émis sur un autre site est « invalide », même s’il est authentique', async () => {
  const hotesAutorises = ['horsfiltre.fr', 'www.horsfiltre.fr'];
  const ailleurs = faux(succes({ success: true, hostname: 'site-pirate.exemple' }));
  assert.equal(await creerVerificateurTurnstile({ secret: 's', hotesAutorises, fetchImpl: ailleurs.fetchImpl })('jeton'), 'invalide');
  const sansNom = faux(succes({ success: true }));
  assert.equal(await creerVerificateurTurnstile({ secret: 's', hotesAutorises, fetchImpl: sansNom.fetchImpl })('jeton'), 'invalide');
  const bon = faux(succes({ success: true, hostname: 'www.horsfiltre.fr' }));
  assert.equal(await creerVerificateurTurnstile({ secret: 's', hotesAutorises, fetchImpl: bon.fetchImpl })('jeton'), 'ok');
});

test('Turnstile : si Cloudflare ne répond pas, on ne laisse pas passer, mais on ne dit pas « robot » : « indisponible »', async () => {
  const reseau = faux(async () => { throw new TypeError('fetch failed'); });
  assert.equal(await creerVerificateurTurnstile({ secret: 's', fetchImpl: reseau.fetchImpl })('jeton'), 'indisponible');
  const panne = faux(async () => new Response('erreur', { status: 500 }));
  assert.equal(await creerVerificateurTurnstile({ secret: 's', fetchImpl: panne.fetchImpl })('jeton'), 'indisponible');
  // Une réponse d'erreur n'est jamais crue, même si son corps affirme un succès, ou un refus.
  for (const corps of [{ success: true, hostname: 'horsfiltre.fr' }, { success: false }]) {
    const erreur = faux(async () => new Response(JSON.stringify(corps), { status: 503 }));
    assert.equal(await creerVerificateurTurnstile({ secret: 's', fetchImpl: erreur.fetchImpl })('jeton'), 'indisponible', JSON.stringify(corps));
  }
  const illisible = faux(async () => new Response('<html>pas du json</html>', { status: 200 }));
  assert.equal(await creerVerificateurTurnstile({ secret: 's', fetchImpl: illisible.fetchImpl })('jeton'), 'indisponible');
});

test('Turnstile : une réponse qui n’affirme pas explicitement le succès est refusée', async () => {
  for (const donnees of [{}, { success: 'true' }, { success: 1 }, { success: null }]) {
    const f = faux(succes(donnees));
    assert.equal(await creerVerificateurTurnstile({ secret: 's', fetchImpl: f.fetchImpl })('jeton'), 'invalide', JSON.stringify(donnees));
  }
});
