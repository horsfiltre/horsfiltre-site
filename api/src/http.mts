// Les routes publiques de l'API de réservation, sans AWS : une requête entre, une réponse sort.
// L'adaptation à API Gateway (lambda.mts) et le branchement du stockage viennent ensuite.
// Contrat : docs/api/reservations.openapi.yaml.
import {
  ErreurMetier,
  FORMAT_IDENTIFIANT,
  FUSEAU,
  annulerReservation,
  consulterReservation,
  creneauxPublics,
  dateParis,
  empreinteEmail,
  fenetreReservation,
  identifiantDepuisCle,
  reporterReservation,
  reserverCreneau,
  validerDemande,
  type Reservation,
  type Stockage,
} from '../../shared/src/index.mts';
import type { VerificationTurnstile } from './turnstile.mts';

export type Requete = {
  methode: string;
  chemin: string;
  requete: Record<string, string | undefined>;
  /** En-têtes, noms en minuscules. */
  entetes: Record<string, string | undefined>;
  corps: string | null;
  ip?: string;
  idRequete: string;
};

export type Reponse = { statut: number; entetes: Record<string, string>; corps: string };

export type DependancesHttp = {
  stockage: Stockage;
  maintenant: () => Date;
  /** Secret de signature des liens d'annulation, lu au démarrage dans le magasin de paramètres. */
  secretJeton: string;
  verifierTurnstile: (jeton: string, ip?: string) => Promise<VerificationTurnstile>;
  /** Prénom affiché pour un accompagnant. */
  prenomDe: (accompagnantId: string) => Promise<string>;
  /** Origines autorisées à appeler l'API depuis un navigateur. `https://*.exemple.fr` désigne un sous-domaine. */
  originesAutorisees: readonly string[];
  /** Branchés sur l'envoi des e-mails au lot 6c. Une erreur ici ne fait jamais échouer la requête. */
  apresReservation?: (evt: { reservation: Reservation; jeton: string }) => Promise<void>;
  apresAnnulation?: (evt: { reservation: Reservation }) => Promise<void>;
  apresReport?: (evt: { reservation: Reservation }) => Promise<void>;
  /** Journal structuré. Ne reçoit jamais d'adresse e-mail, de prénom ni de numéro de téléphone. */
  journal?: (evenement: Record<string, unknown>) => void;
};

const TAILLE_MAX_CORPS = 8192;
const FORMAT_CLE_IDEMPOTENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = '([0-9A-HJKMNP-TV-Z]{26})';

// ------------------------------------------------------------------------------------------------ réponses

const ENTETES_COMMUNS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } as const;

function json(statut: number, donnees: unknown, entetes: Record<string, string> = {}): Reponse {
  return { statut, entetes: { ...ENTETES_COMMUNS, 'content-type': 'application/json; charset=utf-8', ...entetes }, corps: JSON.stringify(donnees) };
}

/** Format « problem details » (RFC 9457), comme le contrat d'API. `erreurs` donne un message par champ. */
function probleme(statut: number, code: string, titre: string, extra: Record<string, unknown> = {}, entetes: Record<string, string> = {}): Reponse {
  const corps = { type: `https://horsfiltre.fr/erreurs/${code.replaceAll('_', '-')}`, title: titre, status: statut, code, ...extra };
  return { statut, entetes: { ...ENTETES_COMMUNS, 'content-type': 'application/problem+json; charset=utf-8', ...entetes }, corps: JSON.stringify(corps) };
}

const ERREURS_METIER: Record<string, { statut: number; titre: string }> = {
  creneau_indisponible: { statut: 409, titre: "Ce créneau vient d'être pris." },
  trop_de_reservations: { statut: 409, titre: 'Vous avez déjà un échange réservé. Annulez-le ou reportez-le depuis votre e-mail de confirmation.' },
  reservation_deja_annulee: { statut: 409, titre: 'Cette réservation est déjà annulée.' },
  reservation_passee: { statut: 409, titre: 'Cet échange a déjà commencé : il ne peut plus être modifié.' },
  reservation_introuvable: { statut: 404, titre: 'Réservation introuvable.' },
  jeton_invalide: { statut: 403, titre: "Ce lien n'est pas valide." },
  jeton_expire: { statut: 403, titre: 'Ce lien a expiré.' },
};

function depuisErreurMetier(e: ErreurMetier): Reponse {
  if (e.code === 'creneau_introuvable') {
    return probleme(422, 'donnees_invalides', 'Certaines informations sont à corriger.', { erreurs: { creneauId: "Ce créneau n'existe pas : rechargez la page." } });
  }
  const connue = ERREURS_METIER[e.code];
  return connue ? probleme(connue.statut, e.code, connue.titre) : probleme(500, 'erreur_interne', "Une erreur s'est produite. Réessayez dans un instant.");
}

// ------------------------------------------------------------------------------------------------ CORS

function motifOrigine(motif: string): RegExp {
  // Les caractères spéciaux du motif sont neutralisés, sauf l'étoile, qui désigne UN sous-domaine (lettres, chiffres, tirets).
  const echappe = motif.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${echappe.replace('*', '[a-z0-9-]+')}$`, 'i');
}

function enTetesCors(origine: string | undefined, autorisees: readonly string[]): Record<string, string> {
  if (!origine || !autorisees.some((m) => motifOrigine(m).test(origine))) return {};
  return { 'access-control-allow-origin': origine, vary: 'Origin' };
}

// ------------------------------------------------------------------------------------------------ routes

type Contexte = { deps: DependancesHttp; req: Requete; parametres: string[]; maintenant: Date };
type Route = { methode: string; motif: RegExp; nom: string; traiter: (c: Contexte) => Promise<Reponse> };

function lireJson(req: Requete): { ok: true; valeur: unknown } | { ok: false; reponse: Reponse } {
  if (!(req.entetes['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    return { ok: false, reponse: probleme(415, 'type_non_supporte', 'Le contenu doit être au format JSON.') };
  }
  const corps = req.corps ?? '';
  if (Buffer.byteLength(corps) > TAILLE_MAX_CORPS) return { ok: false, reponse: probleme(413, 'corps_trop_grand', 'La demande est trop volumineuse.') };
  try {
    return { ok: true, valeur: JSON.parse(corps) };
  } catch {
    return { ok: false, reponse: probleme(400, 'json_invalide', "Le contenu n'est pas du JSON valide.") };
  }
}

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

async function prevenir(deps: DependancesHttp, fn: (() => Promise<void>) | undefined, nom: string): Promise<void> {
  if (!fn) return;
  try {
    await fn();
  } catch (e) {
    deps.journal?.({ niveau: 'erreur', evenement: 'effet_apres_requete_en_echec', effet: nom, erreur: e instanceof Error ? e.name : 'inconnue' });
  }
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
        await prevenir(deps, deps.apresReservation && (() => deps.apresReservation!({ reservation, jeton })), 'reservation');
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
        await prevenir(deps, deps.apresAnnulation && (() => deps.apresAnnulation!({ reservation: annulee })), 'annulation');
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
        await prevenir(deps, deps.apresReport && (() => deps.apresReport!({ reservation: apres })), 'report');
        return json(200, await vue(deps, apres));
      } catch (e) {
        if (e instanceof ErreurMetier) return depuisErreurMetier(e);
        throw e;
      }
    },
  },
];

const METHODES_PAR_CHEMIN = (chemin: string): string[] => ROUTES.filter((r) => r.motif.test(chemin)).map((r) => r.methode);

// ------------------------------------------------------------------------------------------------ point d'entrée

export function creerGestionnaire(deps: DependancesHttp): (req: Requete) => Promise<Reponse> {
  return async (req) => {
    const debut = Date.now();
    const cors = enTetesCors(req.entetes.origin, deps.originesAutorisees);
    let nomRoute = 'inconnue';
    let reponse: Reponse;
    try {
      if (req.methode === 'OPTIONS') {
        nomRoute = 'preflight';
        reponse = Object.keys(cors).length
          ? { statut: 204, entetes: { ...ENTETES_COMMUNS, ...cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, idempotency-key', 'access-control-max-age': '600' }, corps: '' }
          : probleme(403, 'origine_refusee', "Cette origine n'est pas autorisée.");
      } else {
        const route = ROUTES.find((r) => r.methode === req.methode && r.motif.test(req.chemin));
        if (route) {
          nomRoute = route.nom;
          const parametres = (route.motif.exec(req.chemin) ?? []).slice(1);
          reponse = await route.traiter({ deps, req, parametres, maintenant: deps.maintenant() });
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
    deps.journal?.({ niveau: 'info', evenement: 'requete', idRequete: req.idRequete, methode: req.methode, route: nomRoute, statut: reponse.statut, code, dureeMs: Date.now() - debut });
    return reponse;
  };
}

