import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerJeton, empreinteEmail, validerDemande, verifierJeton } from '../src/reservation.mts';
import { identifiantCreneau, nouvelIdentifiant, FORMAT_IDENTIFIANT } from '../src/identifiants.mts';

const base = () => ({
  creneauId: identifiantCreneau('ilyas', '2026-11-18T17:00:00.000Z'),
  prenom: 'Sarah', email: 'sarah@exemple.fr', recherche: 'alternance', canal: 'visio', turnstile: 'jeton-turnstile',
});

test('une demande complète est acceptée et normalisée', () => {
  const r = validerDemande({ ...base(), prenom: '  Anne-Claire   Dupont ', email: ' Sarah@Exemple.FR ', canal: 'whatsapp', whatsapp: '+212 6 12-34 56 78', fuseau: 'Africa/Casablanca', motivation: ' un ami ' });
  assert.ok(r.ok);
  assert.equal(r.valeur.prenom, 'Anne-Claire Dupont');
  assert.equal(r.valeur.email, 'sarah@exemple.fr');
  assert.equal(r.valeur.whatsapp, '+212612345678');
  assert.equal(r.valeur.fuseau, 'Africa/Casablanca');
  assert.equal(r.valeur.motivation, 'un ami');
});

test('une demande vide signale chaque champ obligatoire, avec un message affichable tel quel', () => {
  const r = validerDemande({});
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.erreurs).sort(), ['canal', 'creneauId', 'email', 'prenom', 'recherche', 'turnstile']);
  assert.equal(r.erreurs.prenom, 'Indiquez votre prénom.');
});

test('le numéro WhatsApp n’est exigé que si le canal est WhatsApp', () => {
  assert.ok(validerDemande(base()).ok);
  const sans = validerDemande({ ...base(), canal: 'whatsapp' });
  assert.ok(!sans.ok && sans.erreurs.whatsapp === 'Indiquez votre numéro WhatsApp.');
  const faux = validerDemande({ ...base(), canal: 'whatsapp', whatsapp: '12345' });
  assert.ok(!faux.ok && faux.erreurs.whatsapp?.startsWith('Indiquez un numéro de 8 à 15 chiffres'));
});

test('les entrées dangereuses ou aberrantes sont refusées', () => {
  const html = validerDemande({ ...base(), prenom: '<script>alert(1)</script>' });
  assert.ok(!html.ok && html.erreurs.prenom);
  assert.ok(!validerDemande({ ...base(), email: 'pas-un-email' }).ok);
  assert.ok(!validerDemande({ ...base(), recherche: 'astronaute' }).ok);
  assert.ok(!validerDemande({ ...base(), creneauId: 'n-importe-quoi' }).ok);
  assert.ok(!validerDemande({ ...base(), motivation: 'x'.repeat(501) }).ok);
  assert.ok(!validerDemande({ ...base(), prenom: 'x'.repeat(61) }).ok);
  assert.ok(!validerDemande(null).ok);
  assert.ok(!validerDemande('texte').ok);
});

test('un prénom avec accents, apostrophe ou autre alphabet est accepté', () => {
  for (const prenom of ['Élodie', "Jean-Pierre", "D’Artagnan", 'Zoë', 'Yacine', 'محمد']) {
    assert.ok(validerDemande({ ...base(), prenom }).ok, prenom);
  }
});

test('un fuseau inconnu n’est pas une erreur : les heures seront à l’heure de Paris', () => {
  const r = validerDemande({ ...base(), fuseau: 'Mars/Phobos' });
  assert.ok(r.ok);
  assert.equal(r.valeur.fuseau, 'Europe/Paris');
});

test('l’empreinte d’une adresse e-mail ignore la casse et les espaces', () => {
  assert.equal(empreinteEmail(' Sarah@Exemple.fr '), empreinteEmail('sarah@exemple.fr'));
  assert.notEqual(empreinteEmail('a@exemple.fr'), empreinteEmail('b@exemple.fr'));
});

const secret = 'secret-de-test-assez-long-pour-etre-realiste';
const debut = new Date('2026-11-18T17:00:00Z');

test('un jeton valide donne la réservation, jusqu’à 24 h après le début du créneau', () => {
  const id = nouvelIdentifiant();
  assert.match(id, FORMAT_IDENTIFIANT);
  const jeton = creerJeton(secret, id, debut);
  assert.deepEqual(verifierJeton(secret, jeton, new Date('2026-11-17T08:00:00Z')), { ok: true, reservationId: id });
  assert.deepEqual(verifierJeton(secret, jeton, new Date('2026-11-19T16:59:00Z')), { ok: true, reservationId: id });
  assert.deepEqual(verifierJeton(secret, jeton, new Date('2026-11-19T17:01:00Z')), { ok: false, raison: 'expire' });
});

test('un jeton falsifié, signé avec un autre secret ou mal formé est refusé', () => {
  const id = nouvelIdentifiant();
  const jeton = creerJeton(secret, id, debut);
  const maintenant = new Date('2026-11-17T08:00:00Z');
  const [charge, signature] = jeton.split('.') as [string, string];
  const autreCharge = Buffer.from(JSON.stringify({ r: nouvelIdentifiant(), e: 9999999999 })).toString('base64url');
  assert.deepEqual(verifierJeton(secret, `${autreCharge}.${signature}`, maintenant), { ok: false, raison: 'invalide' });
  assert.deepEqual(verifierJeton('autre-secret', jeton, maintenant), { ok: false, raison: 'invalide' });
  assert.deepEqual(verifierJeton(secret, `${charge}.AAAA`, maintenant), { ok: false, raison: 'invalide' });
  for (const mauvais of ['', 'abc', 'a.b.c', `${charge}.`]) assert.deepEqual(verifierJeton(secret, mauvais, maintenant), { ok: false, raison: 'invalide' });
});
