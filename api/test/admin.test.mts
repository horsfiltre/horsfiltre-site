import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StockageMemoire, empreinteEmail, nouvelIdentifiant, synchroniserCreneaux, type Creneau, type Regle, type Reservation } from '../../shared/src/index.mts';
import { creerGestionnaire, type Reponse, type Requete } from '../src/http.mts';
import { groupesDepuisClaim, type Identite } from '../src/commun.mts';

// Lundi 16 novembre 2026, 10 h à Paris : la fenêtre de trois semaines va jusqu'au 7 décembre.
const LUNDI = new Date('2026-11-16T09:00:00Z');
const ADMIN: Identite = { sub: 'sub-admin-1', groupes: ['administrateurs'] };
const LIEN_ILYAS = 'https://meet.google.com/abc-defg-hij';
const mardi: Regle = { id: 'R-ILYAS', accompagnantId: 'ilyas', jour: 'mardi', debut: '18:00', fin: '21:00', valideDu: '2026-11-01', valideAu: null };
const jeudi: Regle = { id: 'R-SARAH', accompagnantId: 'sarah', jour: 'jeudi', debut: '10:00', fin: '12:00', valideDu: '2026-11-01', valideAu: null };

async function monde() {
  const stockage = new StockageMemoire();
  await stockage.ecrireAccompagnant({ id: 'ilyas', prenom: 'Ilyas', lienVisio: LIEN_ILYAS, actif: true });
  await stockage.ecrireAccompagnant({ id: 'sarah', prenom: 'Sarah', lienVisio: 'https://meet.google.com/xyz-wxyz-wxy', actif: true });
  await stockage.ecrireRegle(mardi);
  await stockage.ecrireRegle(jeudi);
  await synchroniserCreneaux(stockage, LUNDI);
  const etat = { maintenant: LUNDI, evenements: [] as Record<string, unknown>[], annulations: [] as { message?: string; parAdministrateur: boolean }[] };
  const gestionnaire = creerGestionnaire({
    stockage, maintenant: () => etat.maintenant, secretJeton: 'secret-de-test-assez-long',
    verifierTurnstile: async () => 'ok', prenomDe: async (id) => id,
    originesAutorisees: ['https://horsfiltre.fr'], originesAdministration: ['https://admin.horsfiltre.fr'],
    apresAnnulation: async (e) => { etat.annulations.push({ message: e.message, parAdministrateur: e.parAdministrateur }); },
    journal: (e) => etat.evenements.push(e),
  });
  // `null` = aucune identité. Attention : `undefined` déclencherait la valeur par défaut, donc une identité d'administrateur.
  const appeler = (r: Partial<Requete> & { methode: string; chemin: string }, identite: Identite | null = ADMIN): Promise<Reponse> =>
    gestionnaire({ requete: {}, entetes: {}, corps: null, idRequete: 'req-1', ...(identite ? { identite } : {}), ...r });
  const envoyer = (methode: string, chemin: string, corps?: unknown, requete: Record<string, string> = {}) =>
    appeler({ methode, chemin, requete, corps: corps === undefined ? null : JSON.stringify(corps), entetes: { 'content-type': 'application/json' } });
  const lire = (r: Reponse) => JSON.parse(r.corps) as any;
  const creneauxDe = (acc: string) => [...stockage.creneaux.values()].filter((c) => c.accompagnantId === acc).sort((a, b) => a.debut.localeCompare(b.debut));
  const reserver = async (c: Creneau, email = 'candidat@exemple.fr') => {
    const r: Reservation = { id: nouvelIdentifiant(), creneauId: c.id, accompagnantId: c.accompagnantId, debut: c.debut, fin: c.fin, statut: 'confirmee',
      prenom: 'Camille', email, empreinteEmail: empreinteEmail(email), recherche: 'alternance', canal: 'whatsapp', whatsapp: '+33612345678', motivation: 'texte libre du candidat',
      fuseau: 'Europe/Paris', creeLe: LUNDI.toISOString() };
    await stockage.reserver(c.id, r);
    return r;
  };
  return { stockage, etat, appeler, envoyer, lire, creneauxDe, reserver };
}

/** Les 15 routes d'administration, avec un identifiant plausible pour celles qui en ont un. */
const ID = 'ABCDEFGHJKMNPQRSTVWXYZ0123';
const TOUTES = [
  ['GET', '/v1/admin/accompagnants'], ['PATCH', '/v1/admin/accompagnants/ilyas'],
  ['GET', '/v1/admin/regles'], ['POST', '/v1/admin/regles'], ['PUT', `/v1/admin/regles/${ID}`], ['DELETE', `/v1/admin/regles/${ID}`],
  ['GET', '/v1/admin/absences'], ['POST', '/v1/admin/absences'], ['DELETE', `/v1/admin/absences/${ID}`],
  ['GET', '/v1/admin/creneaux'], ['POST', '/v1/admin/creneaux'], ['PATCH', `/v1/admin/creneaux/${ID}`],
  ['GET', '/v1/admin/reservations'], ['POST', `/v1/admin/reservations/${ID}/annulation`], ['GET', '/v1/admin/conflits'],
] as const;

// ---------------------------------------------------------------------------------------------- contrôle d'accès

test('accès : sans identité, chacune des 15 routes répond 401 et ne touche à rien', async () => {
  const m = await monde();
  const avant = m.stockage.creneaux.size;
  for (const [methode, chemin] of TOUTES) {
    const r = await m.appeler({ methode, chemin, corps: '{}', entetes: { 'content-type': 'application/json' } }, null);
    assert.equal(r.statut, 401, `${methode} ${chemin}`);
    assert.equal(r.entetes['www-authenticate'], 'Bearer');
    assert.equal(m.lire(r).code, 'non_authentifie');
  }
  assert.equal(m.stockage.creneaux.size, avant);
});

test('accès : une identité hors du groupe des administrateurs reçoit 403 sur chacune des 15 routes, sans aucun effet', async () => {
  const m = await monde();
  const avant = { creneaux: m.stockage.creneaux.size, regles: m.stockage.regles.size };
  for (const groupes of [[], ['candidats'], ['administrateur'], ['administrateurs-externes'], ['ADMINISTRATEURS'], ['xadministrateurs']]) {
    for (const [methode, chemin] of TOUTES) {
      const r = await m.appeler({ methode, chemin, corps: '{}', entetes: { 'content-type': 'application/json' } }, { sub: 'intrus', groupes });
      assert.equal(r.statut, 403, `${methode} ${chemin} avec ${JSON.stringify(groupes)}`);
      assert.equal(m.lire(r).code, 'acces_refuse');
      assert.doesNotMatch(r.corps, /ilyas|sarah|@/);
    }
  }
  assert.deepEqual({ creneaux: m.stockage.creneaux.size, regles: m.stockage.regles.size }, avant);
});

test('accès : un membre du groupe passe, même s’il en a d’autres', async () => {
  const m = await monde();
  const r = await m.appeler({ methode: 'GET', chemin: '/v1/admin/accompagnants' }, { sub: 'u', groupes: ['candidats', 'administrateurs'] });
  assert.equal(r.statut, 200);
});

test('accès : les routes publiques ne demandent aucune identité', async () => {
  const m = await monde();
  const r = await m.appeler({ methode: 'GET', chemin: '/v1/creneaux' }, null);
  assert.equal(r.statut, 200);
});

test('CORS : l’administration n’accepte que son origine, et le site public ne peut pas l’appeler depuis un navigateur', async () => {
  const m = await monde();
  const avec = async (chemin: string, origin: string) => (await m.appeler({ methode: 'GET', chemin, entetes: { origin } })).entetes['access-control-allow-origin'];
  assert.equal(await avec('/v1/admin/accompagnants', 'https://admin.horsfiltre.fr'), 'https://admin.horsfiltre.fr');
  assert.equal(await avec('/v1/admin/accompagnants', 'https://horsfiltre.fr'), undefined);
  assert.equal(await avec('/v1/admin/accompagnants', 'https://evil.example'), undefined);
  assert.equal(await avec('/v1/creneaux', 'https://admin.horsfiltre.fr'), undefined); // chaque liste a son périmètre
  assert.equal(await avec('/v1/creneaux', 'https://horsfiltre.fr'), 'https://horsfiltre.fr');
  const ok = await m.appeler({ methode: 'OPTIONS', chemin: '/v1/admin/regles', entetes: { origin: 'https://admin.horsfiltre.fr' } }, null);
  assert.equal(ok.statut, 204);
  assert.match(ok.entetes['access-control-allow-headers']!, /authorization/);
  assert.match(ok.entetes['access-control-allow-methods']!, /PATCH/);
  assert.match(ok.entetes['access-control-allow-methods']!, /DELETE/);
  assert.equal((await m.appeler({ methode: 'OPTIONS', chemin: '/v1/admin/regles', entetes: { origin: 'https://horsfiltre.fr' } }, null)).statut, 403);
});

test('les groupes Cognito se lisent sous leurs différentes formes', () => {
  assert.deepEqual(groupesDepuisClaim(['administrateurs', 'autre']), ['administrateurs', 'autre']);
  assert.deepEqual(groupesDepuisClaim('[administrateurs autre]'), ['administrateurs', 'autre']);
  assert.deepEqual(groupesDepuisClaim('administrateurs'), ['administrateurs']);
  assert.deepEqual(groupesDepuisClaim('[a, b]'), ['a', 'b']);
  for (const mauvais of [undefined, null, 42, {}, '', '[]']) assert.deepEqual(groupesDepuisClaim(mauvais), [], String(mauvais));
  assert.deepEqual(groupesDepuisClaim(['ok', 7, null]), ['ok']);
});

// ---------------------------------------------------------------------------------------------- accompagnants

test('accompagnants : la liste donne l’identifiant, le prénom et le lien, rien de plus', async () => {
  const m = await monde();
  const r = await m.envoyer('GET', '/v1/admin/accompagnants');
  assert.equal(r.statut, 200);
  assert.deepEqual(m.lire(r), [{ id: 'ilyas', prenom: 'Ilyas', lienVisio: LIEN_ILYAS }, { id: 'sarah', prenom: 'Sarah', lienVisio: 'https://meet.google.com/xyz-wxyz-wxy' }]);
});

test('accompagnants : modifier le lien, refuser un lien qui n’est pas Google Meet, signaler un inconnu', async () => {
  const m = await monde();
  const nouveau = 'https://meet.google.com/nou-veau-lie';
  const ok = await m.envoyer('PATCH', '/v1/admin/accompagnants/ilyas', { lienVisio: nouveau });
  assert.equal(ok.statut, 200);
  assert.equal(m.lire(ok).lienVisio, nouveau);
  assert.equal((await m.stockage.lireAccompagnant('ilyas'))!.lienVisio, nouveau);
  for (const mauvais of ['https://zoom.us/j/123', 'https://evil.example/abc-defg-hij', 'pas un lien', 42, null]) {
    const r = await m.envoyer('PATCH', '/v1/admin/accompagnants/ilyas', { lienVisio: mauvais });
    assert.equal(r.statut, 422, String(mauvais));
    assert.ok(m.lire(r).erreurs.lienVisio);
  }
  assert.equal((await m.envoyer('PATCH', '/v1/admin/accompagnants/personne', { lienVisio: nouveau })).statut, 404);
  assert.equal((await m.stockage.lireAccompagnant('ilyas'))!.lienVisio, nouveau); // les refus n'ont rien changé
  assert.equal((await m.envoyer('PATCH', '/v1/admin/accompagnants/ilyas', {})).statut, 200); // rien à modifier : sans effet
});

// ---------------------------------------------------------------------------------------------- règles

test('règles : créer une règle donne 201, avec la durée et la pause, et ouvre aussitôt ses créneaux', async () => {
  const m = await monde();
  const avant = m.creneauxDe('sarah').length;
  const r = await m.envoyer('POST', '/v1/admin/regles', { accompagnantId: 'sarah', jour: 'mardi', debut: '14:00', fin: '16:00', valideDu: '2026-11-01' });
  assert.equal(r.statut, 201);
  const corps = m.lire(r);
  assert.match(corps.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(corps.dureeMinutes, 30);
  assert.equal(corps.pauseMinutes, 15);
  assert.equal(corps.valideAu, null);
  assert.equal(m.creneauxDe('sarah').length, avant + 9); // 3 créneaux (14:00, 14:45, 15:30) sur 3 mardis
});

test('règles : chaque champ invalide est signalé, un accompagnant inconnu aussi, et rien n’est créé', async () => {
  const m = await monde();
  const bon = { accompagnantId: 'sarah', jour: 'mardi', debut: '14:00', fin: '16:00', valideDu: '2026-11-01' };
  const cas: [Record<string, unknown>, string][] = [
    [{ accompagnantId: 'Sarah!' }, 'accompagnantId'], [{ accompagnantId: 'personne' }, 'accompagnantId'],
    [{ jour: 'someday' }, 'jour'], [{ jour: undefined }, 'jour'],
    [{ debut: '25:00' }, 'debut'], [{ debut: '9h' }, 'debut'], [{ fin: '16h' }, 'fin'],
    [{ debut: '16:00', fin: '14:00' }, 'fin'], [{ debut: '14:00', fin: '14:20' }, 'fin'], [{ debut: '14:00', fin: '14:00' }, 'fin'],
    [{ valideDu: '2026-02-30' }, 'valideDu'], [{ valideDu: '01/11/2026' }, 'valideDu'], [{ valideDu: undefined }, 'valideDu'],
    [{ valideAu: '2026-10-01' }, 'valideAu'], [{ valideAu: 'demain' }, 'valideAu'],
  ];
  for (const [surcharge, champ] of cas) {
    const r = await m.envoyer('POST', '/v1/admin/regles', { ...bon, ...surcharge });
    assert.equal(r.statut, 422, JSON.stringify(surcharge));
    assert.ok(m.lire(r).erreurs[champ], `${JSON.stringify(surcharge)} : champ ${champ}`);
  }
  assert.equal(m.stockage.regles.size, 2);
  assert.equal((await m.envoyer('POST', '/v1/admin/regles', null)).statut, 422);
  assert.equal((await m.appeler({ methode: 'POST', chemin: '/v1/admin/regles', corps: '{pas du json', entetes: { 'content-type': 'application/json' } })).statut, 400);
});

test('règles : la liste, filtrable par accompagnant, est ordonnée', async () => {
  const m = await monde();
  await m.envoyer('POST', '/v1/admin/regles', { accompagnantId: 'ilyas', jour: 'lundi', debut: '09:00', fin: '10:00', valideDu: '2026-11-01' });
  const tout = m.lire(await m.envoyer('GET', '/v1/admin/regles'));
  assert.deepEqual(tout.map((r: any) => [r.accompagnantId, r.jour]), [['ilyas', 'lundi'], ['ilyas', 'mardi'], ['sarah', 'jeudi']]);
  const filtre = m.lire(await m.envoyer('GET', '/v1/admin/regles', undefined, { accompagnantId: 'sarah' }));
  assert.deepEqual(filtre.map((r: any) => r.id), ['R-SARAH']);
});

test('règles : remplacer une règle garde son identifiant, change ses créneaux libres, jamais un créneau réservé', async () => {
  const m = await monde();
  const pris = m.creneauxDe('ilyas')[0]!;
  await m.reserver(pris);
  const r = await m.envoyer('PUT', '/v1/admin/regles/R-ILYAS'.replace('R-ILYAS', 'R-ILYAS'), { accompagnantId: 'ilyas', jour: 'mardi', debut: '17:00', fin: '19:00', valideDu: '2026-11-01' });
  // « R-ILYAS » n'a pas le format d'un identifiant public : l'itinéraire ne le reconnaît pas.
  assert.equal(r.statut, 404);
  await m.stockage.supprimerRegle('R-ILYAS');
  const creee = m.lire(await m.envoyer('POST', '/v1/admin/regles', { accompagnantId: 'ilyas', jour: 'mardi', debut: '18:00', fin: '21:00', valideDu: '2026-11-01' }));
  await synchroniserCreneaux(m.stockage, LUNDI);
  const pris2 = m.creneauxDe('ilyas').find((c) => c.debut === pris.debut)!;
  if (pris2.statut !== 'reserve') await m.reserver(pris2);
  const ok = await m.envoyer('PUT', `/v1/admin/regles/${creee.id}`, { accompagnantId: 'ilyas', jour: 'mardi', debut: '17:00', fin: '19:00', valideDu: '2026-11-01' });
  assert.equal(ok.statut, 200);
  assert.equal(m.lire(ok).id, creee.id);
  assert.equal(m.lire(ok).debut, '17:00');
  assert.equal((await m.stockage.lireCreneau(pris2.id))!.statut, 'reserve'); // le rendez-vous pris n'a pas bougé
});

test('règles : l’accompagnant d’une règle ne se change pas ; une règle inconnue donne 404', async () => {
  const m = await monde();
  const creee = m.lire(await m.envoyer('POST', '/v1/admin/regles', { accompagnantId: 'ilyas', jour: 'vendredi', debut: '10:00', fin: '12:00', valideDu: '2026-11-01' }));
  const autre = await m.envoyer('PUT', `/v1/admin/regles/${creee.id}`, { accompagnantId: 'sarah', jour: 'vendredi', debut: '10:00', fin: '12:00', valideDu: '2026-11-01' });
  assert.equal(autre.statut, 422);
  assert.ok(m.lire(autre).erreurs.accompagnantId);
  assert.equal((await m.envoyer('PUT', `/v1/admin/regles/${ID}`, { accompagnantId: 'ilyas', jour: 'vendredi', debut: '10:00', fin: '12:00', valideDu: '2026-11-01' })).statut, 404);
  const invalide = await m.envoyer('PUT', `/v1/admin/regles/${creee.id}`, { accompagnantId: 'ilyas', jour: 'vendredi', debut: '12:00', fin: '10:00', valideDu: '2026-11-01' });
  assert.equal(invalide.statut, 422);
  assert.equal((await m.stockage.lireRegle(creee.id))!.debut, '10:00'); // la règle n'a pas été abîmée
});

test('règles : supprimer rend 204 sans corps et retire les créneaux libres ; une seconde suppression, 404', async () => {
  const m = await monde();
  const creee = m.lire(await m.envoyer('POST', '/v1/admin/regles', { accompagnantId: 'sarah', jour: 'mardi', debut: '14:00', fin: '16:00', valideDu: '2026-11-01' }));
  const avant = m.creneauxDe('sarah').length;
  const r = await m.envoyer('DELETE', `/v1/admin/regles/${creee.id}`);
  assert.equal(r.statut, 204);
  assert.equal(r.corps, '');
  assert.equal(m.creneauxDe('sarah').length, avant - 9);
  assert.equal((await m.envoyer('DELETE', `/v1/admin/regles/${creee.id}`)).statut, 404);
});

// ---------------------------------------------------------------------------------------------- absences

test('absences : une absence retire les créneaux libres qu’elle couvre ; la supprimer les rétablit', async () => {
  const m = await monde();
  const avant = m.creneauxDe('ilyas').length;
  const r = await m.envoyer('POST', '/v1/admin/absences', { accompagnantId: 'ilyas', du: '2026-11-24T00:00:00+01:00', au: '2026-11-25T00:00:00+01:00', motif: 'Congés' });
  assert.equal(r.statut, 201);
  const corps = m.lire(r);
  assert.deepEqual(corps.reservationsConcernees, []);
  assert.equal(corps.absence.motif, 'Congés');
  assert.equal(corps.absence.du, '2026-11-23T23:00:00.000Z'); // normalisé en UTC
  assert.equal(m.creneauxDe('ilyas').length, avant - 4);
  assert.equal(m.creneauxDe('sarah').length, 9); // l'absence d'Ilyas ne touche pas Sarah
  const sup = await m.envoyer('DELETE', `/v1/admin/absences/${corps.absence.id}`);
  assert.equal(sup.statut, 204);
  assert.equal(m.creneauxDe('ilyas').length, avant);
  assert.equal((await m.envoyer('DELETE', `/v1/admin/absences/${corps.absence.id}`)).statut, 404);
});

test('absences : un rendez-vous déjà pris pendant l’absence n’est pas supprimé, il est rendu à l’équipe', async () => {
  const m = await monde();
  const pris = m.creneauxDe('ilyas').find((c) => c.debut === '2026-11-24T17:00:00.000Z')!;
  const r = await m.reserver(pris, 'camille@exemple.fr');
  const reponse = await m.envoyer('POST', '/v1/admin/absences', { accompagnantId: 'ilyas', du: '2026-11-24T00:00:00+01:00', au: '2026-11-25T00:00:00+01:00' });
  assert.equal(reponse.statut, 201);
  const concernes = m.lire(reponse).reservationsConcernees;
  assert.equal(concernes.length, 1);
  assert.equal(concernes[0].id, r.id);
  assert.equal(concernes[0].email, 'camille@exemple.fr'); // l'équipe a besoin de pouvoir prévenir la personne
  assert.equal((await m.stockage.lireCreneau(pris.id))!.statut, 'reserve');
  assert.equal((await m.stockage.lireReservation(r.id))!.statut, 'confirmee');
});

test('absences : les dates sans fuseau, inversées, trop longues, et un motif trop long sont refusés', async () => {
  const m = await monde();
  const bon = { accompagnantId: 'ilyas', du: '2026-12-01T00:00:00+01:00', au: '2026-12-05T00:00:00+01:00' };
  const cas: [Record<string, unknown>, string][] = [
    [{ du: '2026-12-01T00:00:00' }, 'du'], [{ du: '2026-12-01' }, 'du'], [{ au: 'bientôt' }, 'au'],
    [{ au: '2026-11-30T00:00:00+01:00' }, 'au'], [{ au: '2026-12-01T00:00:00+01:00' }, 'au'], [{ au: '2028-01-01T00:00:00+01:00' }, 'au'],
    [{ motif: 'x'.repeat(201) }, 'motif'], [{ motif: 42 }, 'motif'], [{ accompagnantId: 'personne' }, 'accompagnantId'],
  ];
  for (const [surcharge, champ] of cas) {
    const r = await m.envoyer('POST', '/v1/admin/absences', { ...bon, ...surcharge });
    assert.equal(r.statut, 422, JSON.stringify(surcharge));
    assert.ok(m.lire(r).erreurs[champ], `${JSON.stringify(surcharge)} : champ ${champ}`);
  }
  assert.equal(m.stockage.absences.size, 0);
  const liste = m.lire(await m.envoyer('GET', '/v1/admin/absences'));
  assert.deepEqual(liste, []);
});

// ---------------------------------------------------------------------------------------------- créneaux

test('créneaux : la période est obligatoire, bornée à 92 jours, et un créneau passé est « passé »', async () => {
  const m = await monde();
  for (const requete of [{}, { du: '2026-11-16' }, { du: '16/11/2026', au: '2026-11-20' }, { du: '2026-11-20', au: '2026-11-16' }, { du: '2026-01-01', au: '2026-12-31' }]) {
    assert.equal((await m.envoyer('GET', '/v1/admin/creneaux', undefined, requete)).statut, 400, JSON.stringify(requete));
  }
  const ok = await m.envoyer('GET', '/v1/admin/creneaux', undefined, { du: '2026-11-16', au: '2026-11-24' });
  assert.equal(ok.statut, 200);
  const liste = m.lire(ok);
  assert.ok(liste.length > 0);
  assert.deepEqual(Object.keys(liste[0]).sort(), ['accompagnantId', 'debut', 'fin', 'id', 'origine', 'regleId', 'reservationId', 'statut']);
  // Une semaine plus tard, les créneaux du 17 novembre sont passés ; ceux qui portent une réservation restent « reserve ».
  const pris = m.creneauxDe('ilyas')[0]!;
  await m.reserver(pris);
  m.etat.maintenant = new Date('2026-11-25T09:00:00Z');
  const apres = m.lire(await m.envoyer('GET', '/v1/admin/creneaux', undefined, { du: '2026-11-16', au: '2026-11-24' }));
  assert.equal(apres.find((c: any) => c.id === pris.id).statut, 'reserve');
  assert.ok(apres.filter((c: any) => c.id !== pris.id).every((c: any) => c.statut === 'passe'));
});

test('créneaux : un créneau ponctuel dure 30 minutes, ne chevauche rien, et respecte la pause', async () => {
  const m = await monde();
  const poser = (accompagnantId: string, debut: string) => m.envoyer('POST', '/v1/admin/creneaux', { accompagnantId, debut });
  const ok = await poser('ilyas', '2026-11-18T10:00:00+01:00');
  assert.equal(ok.statut, 201);
  assert.equal(m.lire(ok).fin, '2026-11-18T09:30:00.000Z');
  assert.equal(m.lire(ok).origine, 'ponctuel');
  assert.equal((await poser('ilyas', '2026-11-18T10:00:00+01:00')).statut, 409);  // le même
  assert.equal((await poser('ilyas', '2026-11-18T10:20:00+01:00')).statut, 409);  // chevauche
  assert.equal((await poser('ilyas', '2026-11-18T10:40:00+01:00')).statut, 409);  // dans la pause de 15 minutes
  assert.equal((await poser('ilyas', '2026-11-18T10:45:00+01:00')).statut, 201);  // juste après la pause
  assert.equal((await poser('sarah', '2026-11-18T10:00:00+01:00')).statut, 201);  // un autre accompagnant n'est pas gêné
  // Un créneau issu d'une règle compte aussi : mardi 17 novembre, 18 h, chez Ilyas.
  assert.equal((await poser('ilyas', '2026-11-17T18:10:00+01:00')).statut, 409);
});

test('créneaux : un créneau ponctuel doit être futur, daté avec un fuseau, et avoir un accompagnant connu', async () => {
  const m = await monde();
  for (const corps of [
    { accompagnantId: 'ilyas', debut: '2026-11-15T10:00:00+01:00' }, { accompagnantId: 'ilyas', debut: '2026-11-18T10:00:00' }, { accompagnantId: 'ilyas', debut: 'demain' },
    { accompagnantId: 'personne', debut: '2026-11-18T10:00:00+01:00' }, { debut: '2026-11-18T10:00:00+01:00' }, {},
  ]) {
    assert.equal((await m.envoyer('POST', '/v1/admin/creneaux', corps)).statut, 422, JSON.stringify(corps));
  }
});

test('créneaux : fermer et rouvrir un créneau ; un créneau réservé ne se ferme pas ; un inconnu donne 404', async () => {
  const m = await monde();
  const libre = m.creneauxDe('ilyas')[0]!;
  const ferme = await m.envoyer('PATCH', `/v1/admin/creneaux/${libre.id}`, { statut: 'ferme' });
  assert.equal(ferme.statut, 200);
  assert.equal(m.lire(ferme).statut, 'ferme');
  assert.equal(m.lire(await m.envoyer('PATCH', `/v1/admin/creneaux/${libre.id}`, { statut: 'libre' })).statut, 'libre');
  const pris = m.creneauxDe('ilyas')[1]!;
  await m.reserver(pris);
  const refus = await m.envoyer('PATCH', `/v1/admin/creneaux/${pris.id}`, { statut: 'ferme' });
  assert.equal(refus.statut, 409);
  assert.equal(m.lire(refus).code, 'creneau_reserve');
  assert.equal((await m.envoyer('PATCH', `/v1/admin/creneaux/${ID}`, { statut: 'ferme' })).statut, 404);
  for (const statut of ['reserve', 'passe', 'n’importe quoi', undefined, 42]) {
    assert.equal((await m.envoyer('PATCH', `/v1/admin/creneaux/${libre.id}`, { statut })).statut, 422, String(statut));
  }
});

// ---------------------------------------------------------------------------------------------- réservations et conflits

test('réservations : la liste montre les coordonnées à l’équipe, avec « passée » calculé, et la période est obligatoire', async () => {
  const m = await monde();
  const r = await m.reserver(m.creneauxDe('ilyas')[0]!);
  assert.equal((await m.envoyer('GET', '/v1/admin/reservations')).statut, 400);
  const liste = m.lire(await m.envoyer('GET', '/v1/admin/reservations', undefined, { du: '2026-11-16', au: '2026-11-30' }));
  assert.equal(liste.length, 1);
  assert.deepEqual(Object.keys(liste[0]).sort(), ['accompagnantId', 'canal', 'creeLe', 'debut', 'email', 'fin', 'id', 'motivation', 'prenom', 'recherche', 'statut', 'whatsapp']);
  assert.equal(liste[0].email, 'candidat@exemple.fr');
  assert.equal(liste[0].statut, 'confirmee');
  m.etat.maintenant = new Date('2026-11-25T09:00:00Z');
  assert.equal(m.lire(await m.envoyer('GET', '/v1/admin/reservations', undefined, { du: '2026-11-16', au: '2026-11-30' }))[0].statut, 'passee');
  assert.equal(r.statut, 'confirmee'); // la réservation stockée, elle, n'a pas changé
});

test('réservations : l’équipe annule avec un message, la personne est prévenue, le créneau se libère', async () => {
  const m = await monde();
  const pris = m.creneauxDe('ilyas')[0]!;
  const r = await m.reserver(pris);
  assert.equal((await m.envoyer('POST', `/v1/admin/reservations/${r.id}/annulation`, {})).statut, 422);
  assert.equal((await m.envoyer('POST', `/v1/admin/reservations/${r.id}/annulation`, { message: '   ' })).statut, 422);
  assert.equal((await m.envoyer('POST', `/v1/admin/reservations/${r.id}/annulation`, { message: 'x'.repeat(1001) })).statut, 422);
  assert.equal((await m.envoyer('POST', `/v1/admin/reservations/${ID}/annulation`, { message: 'Bonjour' })).statut, 404);
  const ok = await m.envoyer('POST', `/v1/admin/reservations/${r.id}/annulation`, { message: 'Nous devons annuler, désolés.' });
  assert.equal(ok.statut, 200);
  assert.equal(m.lire(ok).statut, 'annulee');
  assert.equal((await m.stockage.lireCreneau(pris.id))!.statut, 'libre');
  assert.deepEqual(m.etat.annulations, [{ message: 'Nous devons annuler, désolés.', parAdministrateur: true }]);
  const encore = await m.envoyer('POST', `/v1/admin/reservations/${r.id}/annulation`, { message: 'Bonjour' });
  assert.equal(encore.statut, 409);
  assert.equal(m.etat.annulations.length, 1); // pas de second e-mail
});

test('conflits : après un changement de règle, les réservations qui ne correspondent plus sont listées ; sinon la liste est vide', async () => {
  const m = await monde();
  assert.deepEqual(m.lire(await m.envoyer('GET', '/v1/admin/conflits')), []);
  const pris = m.creneauxDe('ilyas')[0]!;
  const r = await m.reserver(pris);
  assert.deepEqual(m.lire(await m.envoyer('GET', '/v1/admin/conflits')), []);
  await m.stockage.ecrireRegle({ ...mardi, debut: '17:00', fin: '19:00' });
  const conflits = m.lire(await m.envoyer('GET', '/v1/admin/conflits'));
  assert.deepEqual(conflits.map((c: any) => c.id), [r.id]);
  assert.equal(conflits[0].email, 'candidat@exemple.fr');
});

// ---------------------------------------------------------------------------------------------- audit

test('audit : chaque modification laisse une trace avec l’acteur, et le journal ne contient aucune donnée personnelle', async () => {
  const m = await monde();
  const pris = m.creneauxDe('ilyas')[0]!;
  const r = await m.reserver(pris, 'camille@exemple.fr');
  await m.envoyer('PATCH', '/v1/admin/accompagnants/ilyas', { lienVisio: 'https://meet.google.com/sec-rets-lie' });
  await m.envoyer('POST', '/v1/admin/absences', { accompagnantId: 'sarah', du: '2026-12-01T00:00:00+01:00', au: '2026-12-02T00:00:00+01:00', motif: 'raison très privée' });
  await m.envoyer('GET', '/v1/admin/reservations', undefined, { du: '2026-11-16', au: '2026-11-30' });
  await m.envoyer('POST', `/v1/admin/reservations/${r.id}/annulation`, { message: 'message confidentiel pour la personne' });
  const actions = m.etat.evenements.filter((e) => e.evenement === 'admin_action');
  assert.deepEqual(actions.map((e) => e.action), ['accompagnant_modifie', 'absence_creee', 'reservations_consultees', 'reservation_annulee_par_equipe']);
  assert.ok(actions.every((e) => e.acteur === ADMIN.sub));
  const journal = JSON.stringify(m.etat.evenements);
  for (const interdit of ['camille@exemple.fr', 'Camille', 'sec-rets-lie', 'raison très privée', 'message confidentiel', '+33612345678', 'texte libre du candidat']) {
    assert.ok(!journal.includes(interdit), interdit);
  }
  // Les requêtes d'administration indiquent aussi leur acteur, opaque.
  assert.ok(m.etat.evenements.some((e) => e.evenement === 'requete' && e.acteur === ADMIN.sub));
});

test('audit : un accès refusé est journalisé comme tel, sans acteur d’administration', async () => {
  const m = await monde();
  await m.appeler({ methode: 'GET', chemin: '/v1/admin/accompagnants' }, null);
  const e = m.etat.evenements.find((x) => x.evenement === 'requete')!;
  assert.equal(e.statut, 401);
  assert.equal(e.acteur, undefined);
});
