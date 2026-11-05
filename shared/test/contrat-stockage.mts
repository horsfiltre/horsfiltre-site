// Suite de tests commune à toutes les implémentations de `Stockage`.
// Elle tourne ici contre la mémoire, et contre DynamoDB dans api/test-integration : une implémentation qui
// ne passe pas exactement les mêmes tests n'est pas une implémentation du contrat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifiantCreneau, nouvelIdentifiant } from '../src/identifiants.mts';
import { empreinteEmail } from '../src/reservation.mts';
import { ErreurMetier, type Reservation, type Stockage } from '../src/stockage.mts';
import type { Absence, Creneau, Regle } from '../src/creneaux.mts';

export type Fabrique = {
  nom: string;
  /** Un stockage neuf, ou partagé : chaque test utilise son propre accompagnant, donc ne gêne pas les autres. */
  creer: () => Promise<Stockage>;
  /** Retire ce que le test a écrit, pour les bases qui persistent. */
  nettoyer?: (creneaux: Creneau[], reservations: Reservation[], accompagnants: string[]) => Promise<void>;
};

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'aucune erreur';
  } catch (e) {
    return e instanceof ErreurMetier ? e.code : `AUTRE : ${e instanceof Error ? e.message : String(e)}`;
  }
};

export function definirContrat(fabrique: Fabrique): void {
  const { nom, creer, nettoyer } = fabrique;

  /** Un décor isolé : un accompagnant unique, des créneaux en 2030, et le suivi de ce qui doit être nettoyé. */
  async function decor(nombreCreneaux = 4) {
    const stockage = await creer();
    const acc = `essai-${nouvelIdentifiant().toLowerCase()}`;
    const creneaux: Creneau[] = Array.from({ length: nombreCreneaux }, (_, i) => {
      const debut = new Date(Date.UTC(2030, 0, 7 + i, 17, 0)).toISOString();
      return {
        id: identifiantCreneau(acc, debut), accompagnantId: acc, debut,
        fin: new Date(Date.parse(debut) + 1_800_000).toISOString(),
        statut: 'libre', origine: 'regle', regleId: null, reservationId: null,
      };
    });
    await stockage.ecrireCreneaux(creneaux);
    const reservations: Reservation[] = [];
    const reservation = (c: Creneau, email = `${acc}@exemple.fr`): Reservation => {
      const r: Reservation = {
        id: nouvelIdentifiant(), creneauId: c.id, accompagnantId: c.accompagnantId, debut: c.debut, fin: c.fin,
        statut: 'confirmee', prenom: 'Sarah', email, empreinteEmail: empreinteEmail(email),
        recherche: 'alternance', canal: 'visio', whatsapp: null, motivation: null, fuseau: 'Europe/Paris',
        creeLe: '2026-11-03T10:00:00.000Z',
      };
      reservations.push(r);
      return r;
    };
    const fin = async () => { if (nettoyer) await nettoyer(creneaux, reservations, [acc]); };
    return { stockage, acc, creneaux, reservation, fin };
  }

  const dans = (nomTest: string, corps: () => Promise<void>) => test(`[${nom}] ${nomTest}`, corps);

  dans('écrire, lire par identifiant et lister par période', async () => {
    const { stockage, creneaux, fin } = await decor(3);
    try {
      const lu = await stockage.lireCreneau(creneaux[1]!.id);
      assert.deepEqual(lu, creneaux[1]);
      assert.equal(await stockage.lireCreneau('0'.repeat(26)), undefined);
      const liste = await stockage.listerCreneaux(creneaux[0]!.debut, creneaux[1]!.debut);
      assert.deepEqual(liste.filter((c) => c.accompagnantId === creneaux[0]!.accompagnantId).map((c) => c.id), [creneaux[0]!.id, creneaux[1]!.id]);
    } finally { await fin(); }
  });

  dans('réécrire un créneau ne l’écrase jamais', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(2);
    try {
      await stockage.reserver(creneaux[0]!.id, reservation(creneaux[0]!));
      await stockage.changerStatutCreneau(creneaux[1]!.id, 'ferme');
      await stockage.ecrireCreneaux(creneaux); // ils sont tous « libre » dans la liste d'origine
      assert.equal((await stockage.lireCreneau(creneaux[0]!.id))!.statut, 'reserve');
      assert.equal((await stockage.lireCreneau(creneaux[1]!.id))!.statut, 'ferme');
    } finally { await fin(); }
  });

  dans('réserver prend le créneau et enregistre la réservation', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(2);
    try {
      const r = reservation(creneaux[0]!);
      await stockage.reserver(creneaux[0]!.id, r);
      const c = (await stockage.lireCreneau(creneaux[0]!.id))!;
      assert.equal(c.statut, 'reserve');
      assert.equal(c.reservationId, r.id);
      assert.deepEqual(await stockage.lireReservation(r.id), r);
      assert.equal(await stockage.lireReservation(nouvelIdentifiant()), undefined);
    } finally { await fin(); }
  });

  dans('réserver un créneau inconnu, ou déjà pris, est refusé', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(2);
    try {
      assert.equal(await code(stockage.reserver('0'.repeat(26), reservation(creneaux[0]!))), 'creneau_introuvable');
      await stockage.reserver(creneaux[0]!.id, reservation(creneaux[0]!, 'a@exemple.fr'));
      assert.equal(await code(stockage.reserver(creneaux[0]!.id, reservation(creneaux[0]!, 'b@exemple.fr'))), 'creneau_indisponible');
    } finally { await fin(); }
  });

  dans('cinq réservations simultanées du même créneau : une seule aboutit', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(1);
    try {
      const resultats = await Promise.allSettled(
        [1, 2, 3, 4, 5].map((i) => stockage.reserver(creneaux[0]!.id, reservation(creneaux[0]!, `p${i}@exemple.fr`))),
      );
      assert.equal(resultats.filter((r) => r.status === 'fulfilled').length, 1);
      for (const r of resultats) {
        if (r.status === 'rejected') assert.equal((r.reason as ErreurMetier).code, 'creneau_indisponible');
      }
    } finally { await fin(); }
  });

  dans('les réservations actives d’une adresse se comptent, et une annulation en sort', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(2);
    try {
      const email = 'compte@exemple.fr';
      const empreinte = empreinteEmail(email);
      assert.equal(await stockage.compterReservationsActives(empreinte), 0);
      const r = reservation(creneaux[0]!, email);
      await stockage.reserver(creneaux[0]!.id, r);
      assert.equal(await stockage.compterReservationsActives(empreinte), 1);
      assert.equal(await stockage.compterReservationsActives(empreinteEmail('autre@exemple.fr')), 0);
      await stockage.annuler(r.id);
      assert.equal(await stockage.compterReservationsActives(empreinte), 0);
    } finally { await fin(); }
  });

  dans('annuler libère le créneau ; annuler deux fois, ou une réservation inconnue, est refusé', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(2);
    try {
      const r = reservation(creneaux[0]!);
      await stockage.reserver(creneaux[0]!.id, r);
      const annulee = await stockage.annuler(r.id);
      assert.equal(annulee.statut, 'annulee');
      assert.equal((await stockage.lireReservation(r.id))!.statut, 'annulee');
      const c = (await stockage.lireCreneau(creneaux[0]!.id))!;
      assert.equal(c.statut, 'libre');
      assert.equal(c.reservationId, null);
      assert.equal(await code(stockage.annuler(r.id)), 'reservation_deja_annulee');
      assert.equal(await code(stockage.annuler(nouvelIdentifiant())), 'reservation_introuvable');
      // Le créneau libéré peut être pris à nouveau.
      await stockage.reserver(creneaux[0]!.id, reservation(creneaux[0]!, 'suivant@exemple.fr'));
    } finally { await fin(); }
  });

  dans('reporter prend le nouveau créneau et libère l’ancien', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(3);
    try {
      const r = reservation(creneaux[0]!);
      await stockage.reserver(creneaux[0]!.id, r);
      const apres = await stockage.reporter(r.id, creneaux[1]!.id);
      assert.equal(apres.creneauId, creneaux[1]!.id);
      assert.equal(apres.debut, creneaux[1]!.debut);
      assert.equal((await stockage.lireCreneau(creneaux[0]!.id))!.statut, 'libre');
      assert.equal((await stockage.lireCreneau(creneaux[1]!.id))!.statut, 'reserve');
      assert.equal((await stockage.lireReservation(r.id))!.creneauId, creneaux[1]!.id);
      // La réservation reste active, sous la même adresse.
      assert.equal(await stockage.compterReservationsActives(r.empreinteEmail), 1);
      // Et on peut encore l'annuler : le créneau libéré est bien le nouveau.
      await stockage.annuler(r.id);
      assert.equal((await stockage.lireCreneau(creneaux[1]!.id))!.statut, 'libre');
    } finally { await fin(); }
  });

  dans('reporter vers un créneau pris ou inconnu ne change rien', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(3);
    try {
      const r = reservation(creneaux[0]!);
      await stockage.reserver(creneaux[0]!.id, r);
      await stockage.reserver(creneaux[1]!.id, reservation(creneaux[1]!, 'autre@exemple.fr'));
      assert.equal(await code(stockage.reporter(r.id, creneaux[1]!.id)), 'creneau_indisponible');
      assert.equal(await code(stockage.reporter(r.id, '0'.repeat(26))), 'creneau_introuvable');
      assert.equal(await code(stockage.reporter(r.id, creneaux[0]!.id)), 'creneau_indisponible'); // son propre créneau
      assert.equal((await stockage.lireCreneau(creneaux[0]!.id))!.statut, 'reserve');
      assert.equal((await stockage.lireReservation(r.id))!.creneauId, creneaux[0]!.id);
    } finally { await fin(); }
  });

  dans('reporter une réservation annulée ou inconnue est refusé', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(2);
    try {
      const r = reservation(creneaux[0]!);
      await stockage.reserver(creneaux[0]!.id, r);
      await stockage.annuler(r.id);
      assert.equal(await code(stockage.reporter(r.id, creneaux[1]!.id)), 'reservation_deja_annulee');
      assert.equal(await code(stockage.reporter(nouvelIdentifiant(), creneaux[1]!.id)), 'reservation_introuvable');
      assert.equal((await stockage.lireCreneau(creneaux[1]!.id))!.statut, 'libre');
    } finally { await fin(); }
  });

  dans('fermer et rouvrir un créneau ; un créneau réservé ne se ferme pas', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(3);
    try {
      assert.equal((await stockage.changerStatutCreneau(creneaux[0]!.id, 'ferme')).statut, 'ferme');
      assert.equal(await code(stockage.reserver(creneaux[0]!.id, reservation(creneaux[0]!))), 'creneau_indisponible');
      assert.equal((await stockage.changerStatutCreneau(creneaux[0]!.id, 'libre')).statut, 'libre');
      await stockage.reserver(creneaux[0]!.id, reservation(creneaux[0]!, 'enfin@exemple.fr'));
      assert.equal(await code(stockage.changerStatutCreneau(creneaux[0]!.id, 'ferme')), 'creneau_indisponible');
      assert.equal(await code(stockage.changerStatutCreneau('0'.repeat(26), 'ferme')), 'creneau_introuvable');
    } finally { await fin(); }
  });

  dans('la liste montre les créneaux libres, pris et fermés', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(3);
    try {
      await stockage.reserver(creneaux[0]!.id, reservation(creneaux[0]!));
      await stockage.changerStatutCreneau(creneaux[1]!.id, 'ferme');
      const liste = (await stockage.listerCreneaux(creneaux[0]!.debut, creneaux[2]!.debut)).filter((c) => c.accompagnantId === creneaux[0]!.accompagnantId);
      assert.deepEqual(liste.map((c) => c.statut), ['reserve', 'ferme', 'libre']);
    } finally { await fin(); }
  });

  // ------------------------------------------------------------------------------ administration

  const regle = (acc: string, extra: Partial<Regle> = {}): Regle => ({
    id: nouvelIdentifiant(), accompagnantId: acc, jour: 'mardi', debut: '18:00', fin: '21:00', valideDu: '2030-01-01', valideAu: null, ...extra,
  });
  const absence = (acc: string, extra: Partial<Absence> = {}): Absence => ({
    id: nouvelIdentifiant(), accompagnantId: acc, du: '2030-03-01T00:00:00.000Z', au: '2030-03-05T00:00:00.000Z', motif: null, ...extra,
  });

  dans('accompagnants : écrire, lire, lister, remplacer', async () => {
    const { stockage, acc, fin } = await decor(1);
    try {
      assert.equal(await stockage.lireAccompagnant(acc), undefined);
      const a = { id: acc, prenom: 'Ilyas', lienVisio: 'https://meet.google.com/aaa-bbbb-ccc', actif: true };
      await stockage.ecrireAccompagnant(a);
      assert.deepEqual(await stockage.lireAccompagnant(acc), a);
      assert.deepEqual((await stockage.listerAccompagnants()).filter((x) => x.id === acc), [a]);
      await stockage.ecrireAccompagnant({ ...a, prenom: 'Ilyas L.', actif: false });
      assert.deepEqual(await stockage.lireAccompagnant(acc), { ...a, prenom: 'Ilyas L.', actif: false });
      assert.equal((await stockage.listerAccompagnants()).filter((x) => x.id === acc).length, 1); // remplacé, pas dupliqué
    } finally { await fin(); }
  });

  dans('règles : écrire, lister, lire, remplacer, supprimer', async () => {
    const { stockage, acc, fin } = await decor(1);
    try {
      const r1 = regle(acc);
      const r2 = regle(acc, { jour: 'jeudi', debut: '10:00', fin: '12:00', valideAu: '2030-12-31' });
      await stockage.ecrireRegle(r1);
      await stockage.ecrireRegle(r2);
      assert.deepEqual((await stockage.listerRegles(acc)).map((r) => r.id).sort(), [r1.id, r2.id].sort());
      assert.deepEqual(await stockage.lireRegle(r1.id), r1); // valideAu reste « null »
      assert.deepEqual(await stockage.lireRegle(r2.id), r2);
      assert.equal(await stockage.lireRegle(nouvelIdentifiant()), undefined);
      await stockage.ecrireRegle({ ...r1, debut: '17:00' });
      assert.equal((await stockage.lireRegle(r1.id))!.debut, '17:00');
      assert.equal((await stockage.listerRegles(acc)).length, 2); // remplacée, pas dupliquée
      assert.equal(await stockage.supprimerRegle(r1.id), true);
      assert.equal(await stockage.lireRegle(r1.id), undefined);
      assert.equal(await stockage.supprimerRegle(r1.id), false);
      assert.equal(await stockage.supprimerRegle(nouvelIdentifiant()), false);
      assert.equal((await stockage.listerRegles(acc)).length, 1);
    } finally { await fin(); }
  });

  dans('absences : écrire, lister par date, lire, supprimer', async () => {
    const { stockage, acc, fin } = await decor(1);
    try {
      const tard = absence(acc, { du: '2030-06-01T00:00:00.000Z', au: '2030-06-02T00:00:00.000Z' });
      const tot = absence(acc, { motif: 'Vacances' });
      await stockage.ecrireAbsence(tard);
      await stockage.ecrireAbsence(tot);
      assert.deepEqual(await stockage.listerAbsences(acc), [tot, tard]); // par date de début
      assert.deepEqual(await stockage.lireAbsence(tot.id), tot);
      assert.equal(await stockage.lireAbsence(nouvelIdentifiant()), undefined);
      assert.equal(await stockage.supprimerAbsence(tot.id), true);
      assert.equal(await stockage.supprimerAbsence(tot.id), false);
      assert.deepEqual(await stockage.listerAbsences(acc), [tard]);
    } finally { await fin(); }
  });

  dans('supprimer un créneau : libre et fermé oui, réservé jamais, inconnu est « absent »', async () => {
    const { stockage, creneaux, reservation, fin } = await decor(4);
    try {
      await stockage.reserver(creneaux[2]!.id, reservation(creneaux[2]!));
      await stockage.changerStatutCreneau(creneaux[1]!.id, 'ferme');
      assert.equal(await stockage.supprimerCreneau(creneaux[0]!.id), 'supprime');
      assert.equal(await stockage.supprimerCreneau(creneaux[1]!.id), 'supprime');
      assert.equal(await stockage.supprimerCreneau(creneaux[2]!.id), 'reserve');
      assert.equal(await stockage.supprimerCreneau('0'.repeat(26)), 'absent');
      assert.equal(await stockage.supprimerCreneau(creneaux[0]!.id), 'absent'); // déjà supprimé
      assert.equal(await stockage.lireCreneau(creneaux[0]!.id), undefined);
      assert.equal((await stockage.lireCreneau(creneaux[2]!.id))!.statut, 'reserve');
      const restants = (await stockage.listerCreneaux(creneaux[0]!.debut, creneaux[3]!.debut)).filter((c) => c.accompagnantId === creneaux[0]!.accompagnantId);
      assert.deepEqual(restants.map((c) => c.id), [creneaux[2]!.id, creneaux[3]!.id]);
    } finally { await fin(); }
  });

  dans('lister les réservations : confirmées et annulées, par période de début', async () => {
    const { stockage, acc, creneaux, reservation, fin } = await decor(3);
    try {
      const r0 = reservation(creneaux[0]!, 'a@exemple.fr');
      const r1 = reservation(creneaux[1]!, 'b@exemple.fr');
      await stockage.reserver(creneaux[0]!.id, r0);
      await stockage.reserver(creneaux[1]!.id, r1);
      await stockage.annuler(r1.id);
      const tout = (await stockage.listerReservations(creneaux[0]!.debut, creneaux[2]!.debut)).filter((r) => r.accompagnantId === acc);
      assert.deepEqual(tout.map((r) => [r.id, r.statut]), [[r0.id, 'confirmee'], [r1.id, 'annulee']]);
      const apres = (await stockage.listerReservations(creneaux[1]!.debut, creneaux[2]!.debut)).filter((r) => r.accompagnantId === acc);
      assert.deepEqual(apres.map((r) => r.id), [r1.id]);
    } finally { await fin(); }
  });

  test(`[${nom}] un rappel ne s'envoie qu'une fois par réservation, par horaire et par type ; un report en rouvre un nouveau`, async () => {
    const stockage = await creer();
    const id = nouvelIdentifiant();
    const debut = new Date(Date.UTC(2030, 0, 7, 17, 0)).toISOString();
    const autreDebut = new Date(Date.UTC(2030, 0, 9, 17, 0)).toISOString();
    assert.equal(await stockage.marquerRappelEnvoye(id, debut, 'veille'), true); // le premier obtient « vrai » : il envoie
    assert.equal(await stockage.marquerRappelEnvoye(id, debut, 'veille'), false); // le second, jamais
    assert.equal(await stockage.marquerRappelEnvoye(id, debut, 'heure'), true); // l'autre type est indépendant
    assert.equal(await stockage.marquerRappelEnvoye(nouvelIdentifiant(), debut, 'veille'), true); // une autre réservation aussi
    assert.equal(await stockage.marquerRappelEnvoye(id, autreDebut, 'veille'), true); // après un report, de nouveaux rappels repartent
  });

  test(`[${nom}] cinq exécutions simultanées du même rappel : une seule obtient « vrai »`, async () => {
    const stockage = await creer();
    const id = nouvelIdentifiant();
    const debut = new Date(Date.UTC(2030, 0, 8, 17, 0)).toISOString();
    const resultats = await Promise.all(Array.from({ length: 5 }, () => stockage.marquerRappelEnvoye(id, debut, 'heure')));
    assert.equal(resultats.filter(Boolean).length, 1);
  });

  test(`[${nom}] une adresse marquée injoignable le reste, sans que d'autres adresses le deviennent`, async () => {
    const stockage = await creer();
    const a = empreinteEmail(`${nouvelIdentifiant().toLowerCase()}@exemple.fr`);
    const b = empreinteEmail(`${nouvelIdentifiant().toLowerCase()}@exemple.fr`);
    assert.equal(await stockage.adresseInjoignable(a), false);
    await stockage.marquerAdresseInjoignable(a, 'rebond', new Date().toISOString());
    assert.equal(await stockage.adresseInjoignable(a), true);
    assert.equal(await stockage.adresseInjoignable(b), false);
    await stockage.marquerAdresseInjoignable(a, 'plainte', new Date().toISOString()); // rejouer ne casse rien
    assert.equal(await stockage.adresseInjoignable(a), true);
  });
}

