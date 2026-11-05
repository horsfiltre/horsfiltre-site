// Les routes publiques de l'API de réservation, sans AWS : une requête entre, une réponse sort.
// L'adaptation à API Gateway (lambda.mts) et le branchement du stockage viennent ensuite.
// Contrat : docs/api/reservations.openapi.yaml. Les routes d'administration sont dans admin.mts.
import {
  ErreurMetier,
  FORMAT_IDENTIFIANT,
  FUSEAU,
  annulerReservation,
  consulterReservation,
  creerJeton,
  creneauxPublics,
  dateParis,
  empreinteEmail,
  fenetreReservation,
  identifiantDepuisCle,
  reporterReservation,
  reserverCreneau,
  validerDemande,
  type Reservation,
} from '../../shared/src/index.mts';
import { ROUTES_ADMIN } from './admin.mts';
import {
  ENTETES_COMMUNS,
  FORMAT_CLE_IDEMPOTENCE,
  FORMAT_DATE,
  GROUPE_ADMINISTRATEURS,
  ID,
  depuisErreurMetier,
  origineAutorisee,
  enTetesCors,
  json,
  lireJson,
  prevenir,
  probleme,
  type DependancesHttp,
  type Reponse,
  type Requete,
  type Route,
} from './commun.mts';

export type { DependancesHttp, Reponse, Requete } from './commun.mts';

function cleIdempotence(req: Requete): { ok: true; cle: string } | { ok: false; reponse: Reponse } {
  const cle = req.entetes['idempotency-key'];
  if (!cle || !FORMAT_CLE_IDEMPOTENCE.test(cle)) {
    return { ok: false, reponse: probleme(400, 'en_tete_invalide', "L'en-tête Idempotency-Key est obligatoire et doit être un identifiant UUID.") };
  }
  return { ok: true, cle };
}

async function vue(deps: DependancesHttp, r: Reservation) {
  return { id: r.id, debut: r.debut, fin: r.fin, canal: r.canal, statut: r.statut, accompagnant: { prenom: await deps.prenomDe(r.accompagnantId) } };
}

const jetonDeLaRequete = (req: Requete): string | undefined => {
  const j = req.requete.jeton;
  return j && j.length >= 32 && j.length <= 512 ? j : undefined;
};

const ROUTES: Route[] = [
  {
    methode: 'GET', motif: /^\/v1\/creneaux$/, nom: 'creneaux',
    async traiter({ deps, req, maintenant }) {
      const { du, au } = req.requete;
      if ((du && !FORMAT_DATE.test(du)) || (au && !FORMAT_DATE.test(au))) return probleme(400, 'parametre_invalide', 'Les dates se donnent au format AAAA-MM-JJ.');
      const fenetre = fenetreReservation(maintenant);
      const premier = du ?? dateParis(maintenant);
      const dernier = au ?? dateParis(fenetre.fin);
      if (dernier < premier) return probleme(400, 'parametre_invalide', 'La date de fin précède la date de début.');
      const creneaux = await deps.stockage.listerCreneaux(fenetre.debut.toISOString(), fenetre.fin.toISOString());
      const prenoms = new Map<string, string>();
      for (const id of new Set(creneaux.map((c) => c.accompagnantId))) prenoms.set(id, await deps.prenomDe(id));
      const dansLaPeriode = creneauxPublics(creneaux, prenoms, maintenant).filter((c) => {
        const jour = dateParis(new Date(c.debut));
        return jour >= premier && jour <= dernier;
      });
      return json(200, { fuseau: FUSEAU, genereLe: maintenant.toISOString(), creneaux: dansLaPeriode });
    },
  },
  {
    methode: 'POST', motif: /^\/v1\/reservations$/, nom: 'reserver',
    async traiter({ deps, req, maintenant }) {
      const corps = lireJson(req);
      if (!corps.ok) return corps.reponse;
      const idem = cleIdempotence(req);
      if (!idem.ok) return idem.reponse;
      const validation = validerDemande(corps.valeur);
      if (!validation.ok) return probleme(422, 'donnees_invalides', 'Certaines informations sont à corriger.', { erreurs: validation.erreurs });
      const demande = validation.valeur;
      const idReservation = identifiantDepuisCle(idem.cle);

      // Une demande rejouée avec la même clé retombe sur sa réservation, SANS repasser par Turnstile :
      // le jeton, à usage unique, a déjà été consommé par la première tentative.
      const existante = await deps.stockage.lireReservation(idReservation);
      if (existante && existante.statut === 'confirmee' && existante.creneauId === demande.creneauId && existante.empreinteEmail === empreinteEmail(demande.email)) {
        return json(200, await vue(deps, existante), { 'idempotent-replayed': 'true' });
      }

      const verification = await deps.verifierTurnstile(demande.turnstile, req.ip);
      if (verification === 'indisponible') return probleme(503, 'verification_indisponible', "La vérification anti-robot est momentanément indisponible. Réessayez dans un instant.", {}, { 'retry-after': '5' });
      if (verification === 'invalide') {
        return probleme(422, 'turnstile_invalide', 'La vérification anti-robot a échoué.', { erreurs: { turnstile: 'La vérification anti-robot a échoué : rechargez la page.' } });
      }

      try {
        const { reservation, jeton } = await reserverCreneau({ stockage: deps.stockage, maintenant: () => maintenant, secretJeton: deps.secretJeton }, demande, { id: idReservation });
        const origine = origineAutorisee(req.entetes.origin, deps.originesAutorisees);
        await prevenir(deps, deps.apresReservation && (() => deps.apresReservation!({ reservation, jeton, ...(origine ? { origine } : {}) })), 'reservation');
        return json(201, await vue(deps, reservation));
      } catch (e) {
        if (e instanceof ErreurMetier) return depuisErreurMetier(e);
        throw e;
      }
    },
  },
  {
    methode: 'GET', motif: new RegExp(`^/v1/reservations/${ID}$`), nom: 'consulter',
    async traiter({ deps, req, parametres, maintenant }) {
      const jeton = jetonDeLaRequete(req);
      if (!jeton) return depuisErreurMetier(new ErreurMetier('jeton_invalide'));
      try {
        const r = await consulterReservation({ stockage: deps.stockage, maintenant: () => maintenant, secretJeton: deps.secretJeton }, jeton);
        if (r.id !== parametres[0]) return depuisErreurMetier(new ErreurMetier('jeton_invalide'));
        return json(200, await vue(deps, r));
      } catch (e) {
        if (e instanceof ErreurMetier) return depuisErreurMetier(e);
        throw e;
      }
    },
  },
  {
    methode: 'POST', motif: new RegExp(`^/v1/reservations/${ID}/annulation$`), nom: 'annuler',
    async traiter({ deps, req, parametres, maintenant }) {
      const jeton = jetonDeLaRequete(req);
      if (!jeton) return depuisErreurMetier(new ErreurMetier('jeton_invalide'));
      const service = { stockage: deps.stockage, maintenant: () => maintenant, secretJeton: deps.secretJeton };
      try {
        const r = await consulterReservation(service, jeton);
        if (r.id !== parametres[0]) return depuisErreurMetier(new ErreurMetier('jeton_invalide'));
        const annulee = await annulerReservation(service, jeton);
        const origine = origineAutorisee(req.entetes.origin, deps.originesAutorisees);
        await prevenir(deps, deps.apresAnnulation && (() => deps.apresAnnulation!({ reservation: annulee, parAdministrateur: false, ...(origine ? { origine } : {}) })), 'annulation');
        return json(200, await vue(deps, annulee));
      } catch (e) {
        if (e instanceof ErreurMetier) return depuisErreurMetier(e);
        throw e;
      }
    },
  },
  {
    methode: 'POST', motif: new RegExp(`^/v1/reservations/${ID}/report$`), nom: 'reporter',
    async traiter({ deps, req, parametres, maintenant }) {
      const jeton = jetonDeLaRequete(req);
      if (!jeton) return depuisErreurMetier(new ErreurMetier('jeton_invalide'));
      const corps = lireJson(req);
      if (!corps.ok) return corps.reponse;
      const idem = cleIdempotence(req);
      if (!idem.ok) return idem.reponse;
      const nouveau = (corps.valeur as { creneauId?: unknown } | null)?.creneauId;
      if (typeof nouveau !== 'string' || !FORMAT_IDENTIFIANT.test(nouveau)) {
        return probleme(422, 'donnees_invalides', 'Certaines informations sont à corriger.', { erreurs: { creneauId: 'Choisissez un jour et une heure.' } });
      }
      const service = { stockage: deps.stockage, maintenant: () => maintenant, secretJeton: deps.secretJeton };
      try {
        const r = await consulterReservation(service, jeton);
        if (r.id !== parametres[0]) return depuisErreurMetier(new ErreurMetier('jeton_invalide'));
        // Reporter vers le créneau qu'on occupe déjà : la demande a déjà été traitée, on la confirme.
        if (r.statut === 'confirmee' && r.creneauId === nouveau) return json(200, await vue(deps, r), { 'idempotent-replayed': 'true' });
        const apres = await reporterReservation(service, jeton, nouveau);
        const origine = origineAutorisee(req.entetes.origin, deps.originesAutorisees);
        const nouveauJeton = creerJeton(deps.secretJeton, apres.id, new Date(apres.debut));
        await prevenir(deps, deps.apresReport && (() => deps.apresReport!({ reservation: apres, jeton: nouveauJeton, ancienDebut: r.debut, ...(origine ? { origine } : {}) })), 'report');
        return json(200, await vue(deps, apres));
      } catch (e) {
        if (e instanceof ErreurMetier) return depuisErreurMetier(e);
        throw e;
      }
    },
  },
];


const TOUTES_LES_ROUTES: Route[] = [...ROUTES, ...ROUTES_ADMIN];
const METHODES_PAR_CHEMIN = (chemin: string): string[] => TOUTES_LES_ROUTES.filter((r) => r.motif.test(chemin)).map((r) => r.methode);

/** Contrôle d'accès des routes d'administration : une identité vérifiée, membre du groupe des administrateurs. */
function controleAcces(req: Requete): Reponse | undefined {
  if (!req.identite) return probleme(401, 'non_authentifie', 'Connexion requise.', {}, { 'www-authenticate': 'Bearer' });
  if (!req.identite.groupes.includes(GROUPE_ADMINISTRATEURS)) return probleme(403, 'acces_refuse', "Cet accès est réservé à l'équipe.");
  return undefined;
}

// ------------------------------------------------------------------------------------------------ point d'entrée

export function creerGestionnaire(deps: DependancesHttp): (req: Requete) => Promise<Reponse> {
  return async (req) => {
    const debut = Date.now();
    // Les origines autorisées dépendent de la route : le site public ne peut pas appeler l'administration depuis un navigateur.
    const cible = TOUTES_LES_ROUTES.find((r) => r.motif.test(req.chemin));
    const cors = enTetesCors(req.entetes.origin, cible?.admin ? (deps.originesAdministration ?? []) : deps.originesAutorisees);
    let nomRoute = 'inconnue';
    let admin = false;
    let reponse: Reponse;
    try {
      if (req.methode === 'OPTIONS') {
        nomRoute = 'preflight';
        reponse = Object.keys(cors).length
          ? {
              statut: 204,
              entetes: {
                ...ENTETES_COMMUNS, ...cors,
                'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
                'access-control-allow-headers': 'content-type, idempotency-key, authorization',
                'access-control-max-age': '600',
              },
              corps: '',
            }
          : probleme(403, 'origine_refusee', "Cette origine n'est pas autorisée.");
      } else {
        const route = TOUTES_LES_ROUTES.find((r) => r.methode === req.methode && r.motif.test(req.chemin));
        if (route) {
          nomRoute = route.nom;
          admin = route.admin === true;
          const refus = admin ? controleAcces(req) : undefined;
          if (refus) {
            reponse = refus;
          } else {
            const parametres = (route.motif.exec(req.chemin) ?? []).slice(1);
            reponse = await route.traiter({ deps, req, parametres, maintenant: deps.maintenant() });
          }
        } else {
          const permises = METHODES_PAR_CHEMIN(req.chemin);
          reponse = permises.length
            ? probleme(405, 'methode_non_permise', 'Cette méthode n’est pas permise ici.', {}, { allow: [...new Set([...permises, 'OPTIONS'])].join(', ') })
            : probleme(404, 'route_inconnue', 'Cette adresse n’existe pas.');
        }
      }
    } catch (e) {
      // Aucun détail interne ne sort : ni message d'erreur, ni trace.
      deps.journal?.({ niveau: 'erreur', evenement: 'erreur_interne', idRequete: req.idRequete, route: nomRoute, erreur: e instanceof Error ? e.name : 'inconnue' });
      reponse = probleme(500, 'erreur_interne', "Une erreur s'est produite. Réessayez dans un instant.");
    }
    reponse = { ...reponse, entetes: { ...reponse.entetes, ...cors } };
    let code: string | undefined;
    try { code = (JSON.parse(reponse.corps || 'null') as { code?: string } | null)?.code; } catch { /* corps vide */ }
    deps.journal?.({
      niveau: 'info', evenement: 'requete', idRequete: req.idRequete, methode: req.methode, route: nomRoute, statut: reponse.statut, code, dureeMs: Date.now() - debut,
      // L'identifiant de l'acteur est opaque : il permet de retrouver qui a fait quoi, sans nom ni adresse.
      ...(admin && req.identite ? { acteur: req.identite.sub } : {}),
    });
    return reponse;
  };
}
