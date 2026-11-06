import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decrireRefus422 } from '../../public/assets/js/refus.js';

test('refus 422 : des erreurs par champ sont montrées champ par champ', () => {
  assert.equal(decrireRefus422({ status: 422, code: 'donnees_invalides', erreurs: { email: 'x' } }).type, 'champs');
  assert.equal(decrireRefus422({ status: 422, code: 'turnstile_invalide', erreurs: { turnstile: 'x' } }).type, 'champs'); // le détail par champ prime
});

test('refus 422 : une adresse injoignable est reconnue, et distincte du contrôle anti-robot', () => {
  assert.equal(decrireRefus422({ status: 422, code: 'adresse_injoignable' }).type, 'adresse_injoignable');
});

test('refus 422 : seul le code du contrôle anti-robot est présenté comme un échec de ce contrôle', () => {
  assert.equal(decrireRefus422({ status: 422, code: 'turnstile_invalide' }).type, 'robot');
});

test('refus 422 : un refus inconnu, sans code ou sans rien, n’est JAMAIS présenté comme un échec anti-robot', () => {
  for (const e of [{ status: 422, code: 'un_code_futur' }, { status: 422 }, { status: 422, code: '' }, { status: 422, code: 'verification_indisponible' }, {}, null, undefined, 'texte', 42]) {
    assert.equal(decrireRefus422(e).type, 'inconnu', JSON.stringify(e));
  }
});

test('refus 422 : une valeur d’erreurs qui n’est pas un objet n’est pas prise pour des champs', () => {
  for (const erreurs of ['texte', 42, true]) assert.equal(decrireRefus422({ status: 422, erreurs }).type, 'inconnu', String(erreurs));
});
