import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StockageMemoire, creerJeton, empreinteEmail, nouvelIdentifiant, verifierJeton, type Reservation } from '../../shared/src/index.mts';
import { creerNotifications } from '../src/notifications.mts';
import type { Envoi } from '../src/courriel.mts';

const DEBUT = new Date('2026-11-17T17:00:00.000Z');
const MAINTENANT = new Date('2026-11-12T09:00:00.000Z');
const SECRET = 's'.repeat(40);
const COPIE = 'contact@horsfiltre.fr';

function reservation(surcharges: Partial<Reservation> = {}): Reservation {
  const email = surcharges.email ?? `p${nouvelIdentifiant().toLowerCase()}@exemple.fr`;
  return { id: nouvelIdentifiant(), creneauId: 'C', accompagnantId: 'ilyas', debut: DEBUT.toISOString(), fin: new Date(DEBUT.getTime() + 1_800_000).toISOString(), statut: 'confirmee',
    prenom: 'Camille', email, empreinteEmail: empreinteEmail(email), recherche: 'alternance', canal: 'visio', whatsapp: null, motivation: 'Une alternance en logistique.', fuseau: 'Europe/Paris',
    creeLe: '2026-11-10T09:00:00.000Z', ...surcharges };
}
async function monde(options: { echec?: (e: Envoi) => boolean; erreur?: (e: Envoi) => Error; sansAccompagnant?: boolean } = {}) {
  const stockage = new StockageMemoire();
  if (!options.sansAccompagnant) await stockage.ecrireAccompagnant({ id: 'ilyas', prenom: 'Ilyas', lienVisio: 'https://meet.google.com/abc-defg-hij', actif: true });
  const envois: Envoi[] = []; const journal: Record<string, unknown>[] = [];
  const n = creerNotifications({ stockage, secretJeton: SECRET, maintenant: () => MAINTENANT, journal: (e) => journal.push(e), config: { copieInterne: COPIE, urlSite: 'https://horsfiltre.fr' },
    envoyer: async (e) => { if (options.echec?.(e)) throw options.erreur?.(e) ?? Object.assign(new Error('Throttling'), { name: 'ThrottlingException' }); envois.push(e); } });
  return { stockage, envois, journal, n };
}
const jetonDe = (e: Envoi) => e.texte.match(/#([\w.-]+)/)?.[1] ?? '';

test('réservation : la confirmation part avec le calendrier, puis la copie interne, chacune à la bonne adresse', async () => {
  const { n, envois } = await monde(); const r = reservation();
  await n.apresReservation({ reservation: r, jeton: creerJeton(SECRET, r.id, DEBUT) });
  assert.deepEqual(envois.map((e) => e.a), [r.email, COPIE]);
  assert.equal(envois[0]!.ics?.methode, 'PUBLISH');
  assert.ok(envois[0]!.ics!.contenu.includes(`UID:${r.id}@horsfiltre.fr`));
  assert.equal(envois[1]!.ics, undefined);
  assert.ok(envois[1]!.texte.includes(r.email) && envois[1]!.texte.includes('logistique'));
  assert.ok(!envois[0]!.texte.includes('logistique')); // la motivation reste interne
});

test('réservation : le lien de gestion de la confirmation pointe vers le site d’origine de la personne, sinon vers le site par défaut', async () => {
  const { n, envois } = await monde(); const r = reservation(); const jeton = creerJeton(SECRET, r.id, DEBUT);
  await n.apresReservation({ reservation: r, jeton, origine: 'https://lot-9.horsfiltre.pages.dev' });
  await n.apresReservation({ reservation: reservation(), jeton });
  assert.match(envois[0]!.texte, /https:\/\/lot-9\.horsfiltre\.pages\.dev\/reserver\/gerer\/#/);
  assert.match(envois[2]!.texte, /https:\/\/horsfiltre\.fr\/reserver\/gerer\/#/);
});

test('réservation : une adresse injoignable ne reçoit rien, mais l’équipe est prévenue quand même', async () => {
  const { n, envois, stockage, journal } = await monde(); const r = reservation();
  await stockage.marquerAdresseInjoignable(r.empreinteEmail, 'rebond', MAINTENANT.toISOString());
  await n.apresReservation({ reservation: r, jeton: creerJeton(SECRET, r.id, DEBUT) });
  assert.deepEqual(envois.map((e) => e.a), [COPIE]);
  assert.ok(journal.some((e) => e.evenement === 'courriel_ignore'));
});

test('réservation : si l’envoi à la personne échoue, la copie interne part quand même, et l’échec est journalisé sans adresse', async () => {
  const { n, envois, journal } = await monde({ echec: (e) => e.a !== COPIE }); const r = reservation();
  await n.apresReservation({ reservation: r, jeton: creerJeton(SECRET, r.id, DEBUT) });
  assert.deepEqual(envois.map((e) => e.a), [COPIE]);
  const echec = journal.find((e) => e.evenement === 'courriel_echec')!;
  assert.deepEqual([echec.type, echec.erreur, echec.reservationId], ['confirmation', 'ThrottlingException', r.id]);
  assert.doesNotMatch(JSON.stringify(journal), /@exemple\.fr/);
});

test('réservation : un refus de SES est journalisé avec la ressource refusée, sans la partie locale d’aucune adresse', async () => {
  const refus = (e: Envoi) => Object.assign(new Error(`User \`arn:aws:sts::452473973922:assumed-role/preprod-horsfiltre-api/x' is not authorized to perform \`ses:SendEmail' on resource \`arn:aws:ses:eu-west-3:452473973922:identity/contact@horsfiltre.fr' (to ${e.a})`), { name: 'AccessDeniedException', $metadata: { httpStatusCode: 403 } });
  const { n, journal } = await monde({ echec: () => true, erreur: refus }); const r = reservation();
  await n.apresReservation({ reservation: r, jeton: creerJeton(SECRET, r.id, DEBUT) });
  const echecs = journal.filter((e) => e.evenement === 'courriel_echec');
  assert.deepEqual(echecs.map((e) => e.type), ['confirmation', 'copie_interne']);
  for (const e of echecs) {
    assert.equal(e.erreur, 'AccessDeniedException');
    assert.equal(e.statut, 403);
    assert.match(String(e.message), /identity\/\*\*\*@horsfiltre\.fr/);
  }
  const texte = JSON.stringify(journal);
  assert.ok(!texte.includes(r.email) && !texte.includes(COPIE)); // aucune adresse complète
  assert.doesNotMatch(texte, /[\w.+-]@/); // aucune partie locale : seul « *** » précède un @, le domaine reste pour le diagnostic
});

test('réservation : un accompagnant introuvable n’envoie rien d’inexact, et l’échec est journalisé', async () => {
  const { n, envois, journal } = await monde({ sansAccompagnant: true }); const r = reservation();
  await n.apresReservation({ reservation: r, jeton: creerJeton(SECRET, r.id, DEBUT) });
  assert.equal(envois.length, 0);
  assert.equal(journal.find((e) => e.evenement === 'courriel_echec')?.erreur, 'Error');
});

test('report : un nouveau lien valide pour le NOUVEL horaire, l’ancien créneau annoncé, et le calendrier mis à jour', async () => {
  const { n, envois } = await monde(); const nouveau = new Date('2026-12-01T17:00:00.000Z');
  const r = reservation({ debut: nouveau.toISOString(), fin: new Date(nouveau.getTime() + 1_800_000).toISOString() });
  await n.apresReport({ reservation: r, jeton: creerJeton(SECRET, r.id, nouveau), ancienDebut: DEBUT.toISOString() });
  assert.deepEqual(envois.map((e) => e.a), [r.email, COPIE]);
  assert.match(envois[0]!.sujet, /déplacé/);
  assert.match(envois[0]!.texte, /17 novembre/); // l'ancien créneau
  assert.ok(verifierJeton(SECRET, jetonDe(envois[0]!), new Date('2026-12-01T20:00:00Z')).ok); // valable après l'ancien créneau
  assert.match(envois[0]!.ics!.contenu, new RegExp(`UID:${r.id}@horsfiltre.fr`));
  const sequence = Number(envois[0]!.ics!.contenu.match(/SEQUENCE:(\d+)/)![1]);
  assert.ok(sequence > 0, 'la séquence augmente, sinon l’agenda ignore la mise à jour');
  assert.match(envois[1]!.sujet, /^Report \(ancien créneau/);
});

test('annulation par la personne : confirmation d’annulation avec calendrier CANCEL, et copie interne', async () => {
  const { n, envois } = await monde(); const r = reservation({ statut: 'annulee' });
  await n.apresAnnulation({ reservation: r, parAdministrateur: false });
  assert.deepEqual(envois.map((e) => e.a), [r.email, COPIE]);
  assert.equal(envois[0]!.ics?.methode, 'CANCEL');
  assert.match(envois[0]!.ics!.contenu, /METHOD:CANCEL[\s\S]*STATUS:CANCELLED/);
  assert.match(envois[1]!.sujet, /^Annulation/);
});

test('annulation par l’équipe : la personne reçoit le message de l’équipe, et l’équipe n’est pas notifiée de ce qu’elle a fait elle-même', async () => {
  const { n, envois } = await monde(); const r = reservation({ statut: 'annulee' });
  await n.apresAnnulation({ reservation: r, parAdministrateur: true, message: 'Un empêchement de dernière minute.' });
  assert.deepEqual(envois.map((e) => e.a), [r.email]);
  assert.match(envois[0]!.texte, /Un empêchement de dernière minute/);
});

test('un prénom ou une adresse piégés ne cassent ni le HTML ni les en-têtes de l’envoi', async () => {
  const { n, envois } = await monde(); const r = reservation({ prenom: '<img src=x onerror=alert(1)>' });
  await n.apresReservation({ reservation: r, jeton: creerJeton(SECRET, r.id, DEBUT) });
  for (const e of envois) assert.doesNotMatch(e.html, /<img/);
});

test('annulation et report : une adresse injoignable ne reçoit rien non plus, mais l’équipe est prévenue du report et de l’annulation par la personne', async () => {
  const { n, envois, stockage } = await monde(); const r = reservation({ statut: 'annulee' });
  await stockage.marquerAdresseInjoignable(r.empreinteEmail, 'plainte', MAINTENANT.toISOString());
  await n.apresAnnulation({ reservation: r, parAdministrateur: false });
  assert.deepEqual(envois.map((e) => e.a), [COPIE]);
  await n.apresAnnulation({ reservation: r, parAdministrateur: true, message: 'Désolés.' });
  assert.deepEqual(envois.map((e) => e.a), [COPIE]); // l'équipe qui annule ne s'écrit pas à elle-même, et la personne reste injoignable
  const nouveau = new Date('2026-12-01T17:00:00.000Z');
  const deplace = reservation({ email: 'rebond@exemple.fr', debut: nouveau.toISOString(), fin: new Date(nouveau.getTime() + 1_800_000).toISOString() });
  await stockage.marquerAdresseInjoignable(deplace.empreinteEmail, 'rebond', MAINTENANT.toISOString());
  await n.apresReport({ reservation: deplace, jeton: creerJeton(SECRET, deplace.id, nouveau), ancienDebut: DEBUT.toISOString() });
  assert.deepEqual(envois.map((e) => e.a), [COPIE, COPIE]);
});
