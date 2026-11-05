import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StockageMemoire, empreinteEmail, nouvelIdentifiant, verifierJeton, type Reservation } from '../../shared/src/index.mts';
import { executerRappels, rappelDu } from '../src/rappels.mts';
import type { Envoi } from '../src/courriel.mts';

const H = 3_600_000;
const MIN = 60_000;
const DEBUT = new Date('2026-11-17T17:00:00.000Z'); // mardi 18 h à Paris
const apres = (ms: number) => new Date(DEBUT.getTime() + ms);

function reservation(debut: Date, surcharges: Partial<Reservation> = {}): Reservation {
  const email = `p${nouvelIdentifiant().toLowerCase()}@exemple.fr`;
  return { id: nouvelIdentifiant(), creneauId: 'C', accompagnantId: 'ilyas', debut: debut.toISOString(), fin: new Date(debut.getTime() + 30 * MIN).toISOString(),
    statut: 'confirmee', prenom: 'Camille', email, empreinteEmail: empreinteEmail(email), recherche: 'alternance', canal: 'visio', whatsapp: null, motivation: null,
    fuseau: 'Europe/Paris', creeLe: new Date(debut.getTime() - 5 * 24 * H).toISOString(), ...surcharges };
}

async function monde(reservations: Reservation[], maintenant: Date) {
  const stockage = new StockageMemoire();
  await stockage.ecrireAccompagnant({ id: 'ilyas', prenom: 'Ilyas', lienVisio: 'https://meet.google.com/abc-defg-hij', actif: true });
  for (const r of reservations) stockage.reservations.set(r.id, r);
  const envois: Envoi[] = [];
  const journal: Record<string, unknown>[] = [];
  const dep = { stockage, envoyer: async (e: Envoi) => { envois.push(e); }, secretJeton: 's'.repeat(40), urlSite: 'https://horsfiltre.fr', maintenant: () => maintenant, journal: (e: Record<string, unknown>) => journal.push(e) };
  return { stockage, envois, journal, dep };
}

test('fenêtres : l’heure à 45–65 minutes avant, la veille à 23 h–24 h 05 avant, et rien entre les deux', () => {
  const r = reservation(DEBUT);
  const a = (avantMs: number) => rappelDu(r, apres(-avantMs));
  assert.equal(a(65 * MIN), 'heure'); assert.equal(a(60 * MIN), 'heure'); assert.equal(a(46 * MIN), 'heure');
  assert.equal(a(45 * MIN), undefined); assert.equal(a(66 * MIN), undefined); assert.equal(a(10 * MIN), undefined);
  assert.equal(a(24 * H + 5 * MIN), 'veille'); assert.equal(a(24 * H), 'veille'); assert.equal(a(23 * H + MIN), 'veille');
  assert.equal(a(23 * H), undefined); assert.equal(a(24 * H + 6 * MIN), undefined); assert.equal(a(12 * H), undefined); assert.equal(a(3 * 24 * H), undefined);
});

test('fenêtres : une réservation faite moins de 24 h avant le début ne reçoit pas de rappel de la veille', () => {
  const tard = reservation(DEBUT, { creeLe: apres(-20 * H).toISOString() });
  assert.equal(rappelDu(tard, apres(-24 * H)), undefined);
  const juste = reservation(DEBUT, { creeLe: apres(-24 * H).toISOString() });
  assert.equal(rappelDu(juste, apres(-24 * H)), 'veille');
  assert.equal(rappelDu(tard, apres(-60 * MIN)), 'heure'); // le rappel d'une heure, lui, reste dû
});

test('rappels : le rappel de la veille part une fois, avec un lien de gestion valide, même si l’exécution est relancée', async () => {
  const r = reservation(DEBUT);
  const { dep, envois } = await monde([r], apres(-24 * H));
  assert.deepEqual(await executerRappels(dep), { veille: 1, heure: 0, ignores: 0, echecs: 0 });
  assert.equal(envois.length, 1);
  assert.equal(envois[0]!.a, r.email);
  assert.match(envois[0]!.sujet, /demain/);
  const jeton = envois[0]!.texte.match(/https:\/\/horsfiltre\.fr\/reserver\/gerer\/#([\w.-]+)/)?.[1];
  assert.ok(jeton, 'le rappel porte un lien de gestion');
  // Un lien qui a la bonne forme ne suffit pas : il doit ouvrir CETTE réservation, avec le secret du serveur.
  const lu = verifierJeton('s'.repeat(40), jeton!, apres(-24 * H));
  assert.ok(lu.ok && lu.reservationId === r.id, JSON.stringify(lu));
  assert.equal(verifierJeton('autre-secret-'.repeat(4), jeton!, apres(-24 * H)).ok, false);
  assert.deepEqual(await executerRappels(dep), { veille: 0, heure: 0, ignores: 0, echecs: 0 }); // relancé : rien de plus
  assert.equal(envois.length, 1);
});

test('rappels : les deux rappels d’une même réservation sont indépendants', async () => {
  const r = reservation(DEBUT);
  const { dep, envois, stockage } = await monde([r], apres(-24 * H));
  await executerRappels(dep);
  const plusTard = { ...dep, maintenant: () => apres(-60 * MIN) };
  assert.deepEqual(await executerRappels(plusTard), { veille: 0, heure: 1, ignores: 0, echecs: 0 });
  assert.deepEqual(envois.map((e) => /demain/.test(e.sujet) ? 'veille' : 'heure'), ['veille', 'heure']);
  assert.ok(stockage);
});

test('rappels : une réservation annulée, une adresse injoignable ou un créneau hors fenêtre ne reçoivent rien', async () => {
  const annulee = reservation(DEBUT, { statut: 'annulee' });
  const injoignable = reservation(DEBUT);
  const loin = reservation(apres(3 * 24 * H));
  const { dep, envois, stockage } = await monde([annulee, injoignable, loin], apres(-24 * H));
  await stockage.marquerAdresseInjoignable(injoignable.empreinteEmail, 'rebond', new Date().toISOString());
  assert.deepEqual(await executerRappels(dep), { veille: 0, heure: 0, ignores: 1, echecs: 0 });
  assert.equal(envois.length, 0);
});

test('rappels : après un report, le rappel du nouvel horaire part, sans réinitialiser quoi que ce soit', async () => {
  const r = reservation(DEBUT);
  const { dep, envois, stockage } = await monde([r], apres(-24 * H));
  await executerRappels(dep); // rappel de la veille pour l'horaire d'origine
  const nouveauDebut = apres(2 * 24 * H);
  stockage.reservations.set(r.id, { ...r, debut: nouveauDebut.toISOString(), fin: new Date(nouveauDebut.getTime() + 30 * MIN).toISOString() });
  const lendemain = { ...dep, maintenant: () => new Date(nouveauDebut.getTime() - 24 * H) };
  assert.deepEqual(await executerRappels(lendemain), { veille: 1, heure: 0, ignores: 0, echecs: 0 });
  assert.equal(envois.length, 2);
});

test('rappels : un envoi qui échoue est compté et journalisé sans adresse ; les autres rappels partent quand même', async () => {
  const a = reservation(DEBUT); const b = reservation(DEBUT);
  const { dep, envois, journal } = await monde([a, b], apres(-24 * H));
  let appels = 0;
  const instable = { ...dep, envoyer: async (e: Envoi) => { if (++appels === 1) throw Object.assign(new Error('Throttling'), { name: 'ThrottlingException' }); envois.push(e); } };
  const bilan = await executerRappels(instable);
  assert.equal(bilan.echecs, 1); assert.equal(bilan.veille, 1);
  const echec = journal.find((e) => e.evenement === 'courriel_echec')!;
  assert.equal(echec.erreur, 'ThrottlingException');
  assert.doesNotMatch(JSON.stringify(journal), /@exemple\.fr/);
});

test('rappels : cinq exécutions simultanées n’envoient le rappel qu’une fois', async () => {
  const r = reservation(DEBUT);
  const { dep, envois } = await monde([r], apres(-24 * H));
  await Promise.all(Array.from({ length: 5 }, () => executerRappels(dep)));
  assert.equal(envois.length, 1);
});
