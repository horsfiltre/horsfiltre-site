import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { construireMime, creerEnvoyeurSes, encoderSujet, type Envoi } from '../src/courriel.mts';

/** Relit un message MIME produit : les en-têtes, puis chaque partie avec son corps décodé. */
function lire(mime: string) {
  const [tete, ...reste] = mime.split('\r\n\r\n');
  const entetes = Object.fromEntries(tete!.replace(/\r\n /g, ' ').split('\r\n').map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
  return { entetes, corps: reste.join('\r\n\r\n') };
}
const parties = (corps: string, frontiere: string) => corps.split(`--${frontiere}`).slice(1, -1).map((p) => p.replace(/^\r\n/, ''));
const decoder = (partie: string) => Buffer.from(partie.split('\r\n\r\n').slice(1).join('').replace(/\s/g, ''), 'base64').toString('utf8');
const DATE = new Date('2026-11-05T09:00:00Z');
const ENVOI: Envoi = { a: 'camille@exemple.fr', sujet: 'Votre échange avec Hors Filtre : mardi 17 novembre, 18:00', texte: 'Bonjour Camille,\nÀ bientôt.', html: '<p>Bonjour Camille,</p>' };
const compteur = () => { let n = 0; return () => `F${++n}`; };

test('mime : sans calendrier, un message à deux versions (texte et HTML), lisibles et complets', () => {
  const m = lire(construireMime({ de: 'contact@horsfiltre.fr', nomExpediteur: 'Hors Filtre', envoi: ENVOI, date: DATE, frontiere: compteur() }));
  assert.equal(m.entetes.to, 'camille@exemple.fr');
  assert.match(m.entetes.from!, /<contact@horsfiltre\.fr>$/);
  assert.match(m.entetes['content-type']!, /^multipart\/alternative; boundary="F1"/);
  assert.equal(m.entetes['auto-submitted'], 'auto-generated');
  const [texte, html] = parties(m.corps, 'F1');
  assert.equal(decoder(texte!), ENVOI.texte);
  assert.equal(decoder(html!), ENVOI.html);
});

test('mime : avec un calendrier, une enveloppe mixte, les deux versions, et la pièce jointe annoncée avec sa méthode', () => {
  const ics = 'BEGIN:VCALENDAR\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n';
  const m = lire(construireMime({ de: 'contact@horsfiltre.fr', nomExpediteur: 'Hors Filtre', envoi: { ...ENVOI, ics: { contenu: ics, methode: 'PUBLISH' } }, date: DATE, frontiere: compteur() }));
  // Les frontières sont tirées dans l'ordre : F1 pour l'alternative, F2 pour l'enveloppe.
  assert.match(m.entetes['content-type']!, /^multipart\/mixed; boundary="F2"/);
  const [enveloppe, piece] = parties(m.corps, 'F2');
  assert.match(enveloppe!, /multipart\/alternative; boundary="F1"/);
  assert.match(piece!, /Content-Type: text\/calendar; charset=UTF-8; method=PUBLISH/);
  assert.match(piece!, /Content-Disposition: attachment; filename="echange-hors-filtre\.ics"/);
  assert.equal(decoder(piece!), ics);
});

test('mime : un sujet accentué ou long est encodé en mots de 45 octets au plus, sans caractère coupé, et se relit à l’identique', () => {
  const sujet = 'Votre échange avec Hors Filtre : mardi 17 novembre, 18:00, à très bientôt, ça va être super — œuvre complète';
  const encode = encoderSujet(sujet);
  const mots = encode.split('\r\n ');
  assert.ok(mots.length > 1);
  for (const mot of mots) assert.ok(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/.test(mot), mot);
  const relu = mots.map((m) => Buffer.from(m.slice('=?UTF-8?B?'.length, -2), 'base64').toString('utf8')).join('');
  assert.equal(relu, sujet);
  for (const ligne of encode.split('\r\n')) assert.ok(ligne.length <= 76, ligne);
  assert.equal(encoderSujet('Simple'), 'Simple'); // un sujet ASCII reste lisible tel quel
});

test('mime : un retour à la ligne dans le destinataire, le sujet ou l’expéditeur est refusé (injection d’en-tête)', () => {
  const faire = (envoi: Envoi, de = 'contact@horsfiltre.fr') => construireMime({ de, nomExpediteur: 'Hors Filtre', envoi, date: DATE });
  assert.throws(() => faire({ ...ENVOI, a: 'victime@exemple.fr\r\nBcc: attaquant@exemple.fr' }), /interdit/);
  assert.throws(() => faire({ ...ENVOI, a: 'victime@exemple.fr\nBcc: attaquant@exemple.fr' }), /interdit/);
  assert.throws(() => faire({ ...ENVOI, sujet: 'Bonjour\r\nBcc: attaquant@exemple.fr' }), /interdit/);
  assert.throws(() => faire(ENVOI, 'contact@horsfiltre.fr\r\nBcc: x@y.z'), /interdit/);
});

test('mime : un corps contenant la ligne d’une frontière ne peut pas fabriquer de nouvelle partie', () => {
  const piege = { ...ENVOI, texte: '--F1\r\nContent-Type: text/html\r\n\r\n<script>alert(1)</script>' };
  const m = lire(construireMime({ de: 'contact@horsfiltre.fr', nomExpediteur: 'Hors Filtre', envoi: piege, date: DATE, frontiere: compteur() }));
  assert.equal(parties(m.corps, 'F1').length, 2); // le corps est encodé en base64 : la ligne piégée n'apparaît jamais en clair
  assert.doesNotMatch(m.corps, /<script>/);
});

test('ses : l’envoi passe l’expéditeur, le destinataire, l’ensemble de configuration et le message brut', async () => {
  const commandes: SendEmailCommand[] = [];
  const envoyer = creerEnvoyeurSes({ send: async (c) => { commandes.push(c); return {}; } }, { expediteur: 'contact@horsfiltre.fr', ensemble: 'horsfiltre-transactionnel', maintenant: () => DATE });
  await envoyer(ENVOI);
  const entree = commandes[0]!.input;
  assert.equal(entree.FromEmailAddress, 'contact@horsfiltre.fr');
  assert.deepEqual(entree.Destination?.ToAddresses, ['camille@exemple.fr']);
  assert.equal(entree.ConfigurationSetName, 'horsfiltre-transactionnel');
  const brut = Buffer.from(entree.Content!.Raw!.Data!).toString('utf8');
  assert.match(brut, /^From: Hors Filtre <contact@horsfiltre\.fr>/);
  assert.match(brut, /Subject: Votre =\?UTF-8\?B\?|Subject: =\?UTF-8\?B\?/);
});

test('ses : une erreur d’envoi remonte telle quelle (l’appelant la journalise et décide)', async () => {
  const envoyer = creerEnvoyeurSes({ send: async () => { throw Object.assign(new Error('Throttling'), { name: 'ThrottlingException' }); } }, { expediteur: 'contact@horsfiltre.fr', ensemble: 'e' });
  await assert.rejects(envoyer(ENVOI), (e: Error) => e.name === 'ThrottlingException');
});
