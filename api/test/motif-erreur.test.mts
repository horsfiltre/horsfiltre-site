import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masquerAdresses, motifErreur } from '../src/motif-erreur.mts';

// Le message exact que renvoie SES quand la politique IAM ne couvre pas l'identité retenue pour l'expéditeur.
const REFUS_SES = "User `arn:aws:sts::452473973922:assumed-role/preprod-horsfiltre-api/preprod-horsfiltre-api' is not authorized to perform `ses:SendEmail' on resource `arn:aws:ses:eu-west-3:452473973922:identity/contact@horsfiltre.fr'";

test('motif : un refus d’accès garde la ressource refusée, donc la cause, sans la partie locale de l’adresse', () => {
  const m = motifErreur(Object.assign(new Error(REFUS_SES), { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } }));
  assert.equal(m.erreur, 'AccessDeniedException');
  assert.equal(m.statut, 403);
  assert.match(m.message!, /identity\/\*\*\*@horsfiltre\.fr/); // une identité « adresse », et non le domaine : c'est le diagnostic
  assert.match(m.message!, /assumed-role\/preprod-horsfiltre-api/);
  assert.doesNotMatch(m.message!, /contact@/);
});

test('motif : une adresse de destinataire citée par SES perd sa partie locale, où qu’elle soit', () => {
  const texte = 'Email address is not verified. The following identities failed the check in region EU-WEST-3: prenom.nom+essai@gmail.com, <a@b.fr>';
  const masque = masquerAdresses(texte);
  assert.doesNotMatch(masque, /prenom|nom\+essai|\ba@/);
  assert.match(masque, /\*\*\*@gmail\.com, <\*\*\*@b\.fr>/);
});

test('motif : un message trop long est tronqué, une valeur qui n’est pas une erreur reste « inconnue »', () => {
  assert.equal(motifErreur(new Error('x'.repeat(2000))).message!.length, 500);
  assert.deepEqual(motifErreur('chaîne'), { erreur: 'inconnue' });
  assert.deepEqual(motifErreur(Object.assign(new Error(''), { name: 'TimeoutError' })), { erreur: 'TimeoutError' });
});
