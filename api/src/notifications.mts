// Les e-mails qui suivent une action de la personne ou de l'équipe : confirmation, report, annulation, copie interne.
// Un échec d'envoi ne fait JAMAIS échouer la réservation (le gestionnaire HTTP l'isole déjà) ; il est journalisé sous le nom
// `courriel_echec`, que surveille une alarme : sans cela, une panne serait silencieuse et la personne n'aurait jamais son lien.
import {
  creerJeton, fichierIcs, messageAnnulation, messageConfirmation, messageCopieInterne, messageReport, type Message, type Reservation, type Stockage,
} from '../../shared/src/index.mts';
import type { DependancesHttp } from './commun.mts';
import type { Envoi, Envoyeur } from './courriel.mts';

export type Journal = (evenement: Record<string, unknown>) => void;
export type ConfigNotifications = {
  /** Reçoit une copie de chaque réservation, annulation et report. */
  copieInterne: string;
  /** Site sur lequel pointent les liens quand l'origine de la requête n'est pas connue (rappels, annulation par l'équipe). */
  urlSite: string;
};
export type DependancesNotifications = {
  stockage: Stockage;
  envoyer: Envoyeur;
  secretJeton: string;
  maintenant: () => Date;
  journal: Journal;
  config: ConfigNotifications;
};

export const lienDeGestion = (base: string, jeton: string): string => `${base.replace(/\/+$/, '')}/reserver/gerer/#${jeton}`;

export async function contenuAccompagnant(stockage: Stockage, r: Reservation): Promise<{ prenom: string; lienVisio: string }> {
  const a = await stockage.lireAccompagnant(r.accompagnantId);
  if (!a) throw new Error('accompagnant_introuvable');
  return { prenom: a.prenom, lienVisio: a.lienVisio };
}

/** Envoie sans jamais lever : en cas d'échec, une ligne de journal sans adresse ni contenu, et `false`. */
export async function envoyerSurs(d: Pick<DependancesNotifications, 'envoyer' | 'journal'>, type: string, reservationId: string, preparer: () => Promise<Envoi>): Promise<boolean> {
  try {
    await d.envoyer(await preparer());
    d.journal({ niveau: 'info', evenement: 'courriel_envoye', type, reservationId });
    return true;
  } catch (e) {
    d.journal({ niveau: 'erreur', evenement: 'courriel_echec', type, reservationId, erreur: e instanceof Error ? e.name : 'inconnue' });
    return false;
  }
}

const sequenceIcs = (maintenant: Date): number => Math.floor(maintenant.getTime() / 1000);

export function creerNotifications(d: DependancesNotifications): Required<Pick<DependancesHttp, 'apresReservation' | 'apresAnnulation' | 'apresReport'>> {
  const base = (origine?: string) => origine ?? d.config.urlSite;
  const injoignable = async (r: Reservation, type: string): Promise<boolean> => {
    if (!(await d.stockage.adresseInjoignable(r.empreinteEmail))) return false;
    d.journal({ niveau: 'info', evenement: 'courriel_ignore', type, reservationId: r.id, motif: 'adresse_injoignable' });
    return true;
  };
  const vers = (a: string, m: Message, ics?: Envoi['ics']): Envoi => ({ a, ...m, ...(ics ? { ics } : {}) });

  return {
    async apresReservation({ reservation: r, jeton, origine }) {
      const acc = await contenuAccompagnant(d.stockage, r).catch((e) => { d.journal({ niveau: 'erreur', evenement: 'courriel_echec', type: 'confirmation', reservationId: r.id, erreur: (e as Error).name }); return undefined; });
      if (!acc) return;
      const liens = { consulter: lienDeGestion(base(origine), jeton), annuler: '', reporter: '' };
      if (!(await injoignable(r, 'confirmation'))) {
        await envoyerSurs(d, 'confirmation', r.id, async () => vers(r.email, messageConfirmation(r, acc, liens), { contenu: fichierIcs(r, acc, d.maintenant()), methode: 'PUBLISH' }));
      }
      await envoyerSurs(d, 'copie_interne', r.id, async () => vers(d.config.copieInterne, messageCopieInterne(r, acc, 'reservation')));
    },

    async apresReport({ reservation: r, jeton, ancienDebut, origine }) {
      const acc = await contenuAccompagnant(d.stockage, r).catch((e) => { d.journal({ niveau: 'erreur', evenement: 'courriel_echec', type: 'report', reservationId: r.id, erreur: (e as Error).name }); return undefined; });
      if (!acc) return;
      const liens = { consulter: lienDeGestion(base(origine), jeton), annuler: '', reporter: '' };
      if (!(await injoignable(r, 'report'))) {
        // Même identifiant d'événement, séquence plus grande : l'agenda de la personne met l'événement à jour au lieu d'en ajouter un.
        await envoyerSurs(d, 'report', r.id, async () => vers(r.email, messageReport(r, acc, liens, ancienDebut), { contenu: fichierIcs(r, acc, d.maintenant(), { sequence: sequenceIcs(d.maintenant()) }), methode: 'PUBLISH' }));
      }
      await envoyerSurs(d, 'copie_interne', r.id, async () => vers(d.config.copieInterne, messageCopieInterne(r, acc, 'report', ancienDebut)));
    },

    async apresAnnulation({ reservation: r, message, parAdministrateur }) {
      const acc = await contenuAccompagnant(d.stockage, r).catch((e) => { d.journal({ niveau: 'erreur', evenement: 'courriel_echec', type: 'annulation', reservationId: r.id, erreur: (e as Error).name }); return undefined; });
      if (!acc) return;
      if (!(await injoignable(r, 'annulation'))) {
        // METHOD:CANCEL avec le même identifiant : l'événement disparaît de l'agenda de la personne.
        await envoyerSurs(d, 'annulation', r.id, async () => vers(r.email, messageAnnulation(r, parAdministrateur, message), { contenu: fichierIcs(r, acc, d.maintenant(), { methode: 'CANCEL', sequence: sequenceIcs(d.maintenant()) }), methode: 'CANCEL' }));
      }
      // L'équipe qui annule sait déjà qu'elle l'a fait : la copie interne ne concerne que l'annulation par la personne.
      if (!parAdministrateur) await envoyerSurs(d, 'copie_interne', r.id, async () => vers(d.config.copieInterne, messageCopieInterne(r, acc, 'annulation')));
    },
  };
}

export { creerJeton };
