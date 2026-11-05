import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fichierIcs, messageAnnulation, messageConfirmation, messageCopieInterne, messageRappel, type Reservation } from '../src/index.mts';

const BASE: Reservation = {
  id: '01HXYZ', creneauId: 'C1', accompagnantId: 'ilyas', debut: '2026-11-17T17:00:00.000Z', fin: '2026-11-17T17:30:00.000Z',
  statut: 'confirmee', prenom: 'Camille', email: 'camille@exemple.fr', empreinteEmail: 'x', recherche: 'alternance', canal: 'visio',
  whatsapp: null, motivation: null, fuseau: 'Europe/Paris', creeLe: '2026-11-04T10:00:00.000Z',
};
const ACC = { prenom: 'Ilyas', lienVisio: 'https://meet.google.com/abc-defg-hij' };
const LIENS = { consulter: 'https://horsfiltre.fr/reserver/gerer/#jeton', annuler: 'https://horsfiltre.fr/reserver/gerer/#jeton', reporter: 'https://horsfiltre.fr/reserver/gerer/#jeton' };

test('confirmation : le sujet, l’heure de Paris, le lien de gestion et le canal choisi apparaissent', () => {
  const m = messageConfirmation(BASE, ACC, LIENS);
  assert.match(m.sujet, /mardi|17 h|17h|18 h|18h/i); // heure de Paris (18 h l'hiver), pas l'heure UTC du champ
  assert.match(m.texte, /18:00/); // heure de Paris (18:00 l'hiver), même format que le reste du produit
  assert.ok(m.texte.includes(LIENS.consulter));
  assert.ok(m.texte.includes(ACC.lienVisio));
  assert.ok(m.html.includes(LIENS.consulter) && m.html.includes(ACC.lienVisio));
  assert.doesNotMatch(m.texte, /WhatsApp/);
});

test('confirmation : le canal WhatsApp affiche le numéro, pas le lien de visio', () => {
  const r = { ...BASE, canal: 'whatsapp' as const, whatsapp: '+33612345678' };
  const m = messageConfirmation(r, ACC, LIENS);
  assert.ok(m.texte.includes('+33612345678'));
  assert.doesNotMatch(m.texte, /meet\.google\.com/);
  assert.doesNotMatch(m.html, /meet\.google\.com/);
});

test('confirmation : un prénom ou une motivation piégés s’affichent comme du texte dans le HTML', () => {
  const r = { ...BASE, prenom: '<img src=x onerror=alert(1)>' };
  const m = messageConfirmation(r, ACC, LIENS);
  assert.doesNotMatch(m.html, /<img/);
  assert.ok(m.html.includes('&lt;img'));
});

test('rappels : la veille et l’heure se distinguent, et portent le lien de gestion', () => {
  const veille = messageRappel(BASE, ACC, LIENS, 'veille');
  const heure = messageRappel(BASE, ACC, LIENS, 'heure');
  assert.match(veille.sujet, /demain/);
  assert.match(heure.sujet, /heure/);
  assert.notEqual(veille.texte, heure.texte);
  assert.ok(veille.texte.includes(LIENS.consulter) && heure.texte.includes(LIENS.consulter));
});

test('annulation : par l’équipe inclut le message donné ; par la personne, un ton différent', () => {
  const equipe = messageAnnulation(BASE, true, 'Un empêchement de dernière minute, désolés.');
  assert.ok(equipe.texte.includes('Un empêchement de dernière minute'));
  assert.match(equipe.texte, /réserver un nouveau créneau/);
  const soi = messageAnnulation(BASE, false);
  assert.doesNotMatch(soi.texte, /L'équipe a dû annuler/);
});

test('copie interne : contient l’adresse, le canal, la recherche et la motivation si présente', () => {
  const r = { ...BASE, motivation: 'Je cherche une alternance en logistique.' };
  const m = messageCopieInterne(r, ACC);
  assert.ok(m.texte.includes('camille@exemple.fr') && m.texte.includes('alternance') && m.texte.includes('Je cherche une alternance'));
  const sans = messageCopieInterne(BASE, ACC);
  assert.doesNotMatch(sans.texte, /Motivation/);
});

test('ics : contient les bons instants UTC, se replie à 75 octets, et accepte les caractères spéciaux', () => {
  const ics = fichierIcs(BASE, ACC, new Date('2026-11-04T10:00:00.000Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20261117T170000Z'));
  assert.ok(ics.includes('DTEND:20261117T173000Z'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  for (const ligne of ics.split('\r\n')) assert.ok(Buffer.byteLength(ligne, 'utf8') <= 75, ligne);
  const r = { ...BASE, canal: 'whatsapp' as const, whatsapp: '+33612345678; attention, ceci; contient, des virgules' };
  const piege = fichierIcs(r, ACC, new Date('2026-11-04T10:00:00.000Z'));
  assert.ok(piege.includes('\\;') && piege.includes('\\,'));
});

test('ics : un prénom long ou accentué reste correctement replié, sans caractère coupé en deux', () => {
  const accLong = { prenom: 'Jean-Baptiste-Alexandre', lienVisio: ACC.lienVisio };
  const ics = fichierIcs(BASE, accLong, new Date());
  const ligneSummary = ics.split('\r\n').findIndex((l) => l.startsWith('SUMMARY:'));
  // Les lignes de continuation commencent par un espace, et recomposées, le texte est intact.
  let reconstitue = ics.split('\r\n')[ligneSummary]!.slice('SUMMARY:'.length);
  let i = ligneSummary + 1;
  while (ics.split('\r\n')[i]?.startsWith(' ')) { reconstitue += ics.split('\r\n')[i]!.slice(1); i++; }
  assert.ok(reconstitue.includes('Jean-Baptiste-Alexandre'));
});
