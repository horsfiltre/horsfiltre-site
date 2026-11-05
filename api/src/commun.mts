// Socle commun aux routes publiques (http.mts) et d'administration (admin.mts) : types, réponses, erreurs, CORS.
import { ErreurMetier, type Reservation, type Stockage } from '../../shared/src/index.mts';
import type { VerificationTurnstile } from './turnstile.mts';

export type Identite = { sub: string; groupes: readonly string[] };

export type Requete = {
  methode: string;
  chemin: string;
  requete: Record<string, string | undefined>;
  /** En-têtes, noms en minuscules. */
  entetes: Record<string, string | undefined>;
  corps: string | null;
  ip?: string;
  idRequete: string;
  /** Identité vérifiée en amont (jeton Cognito contrôlé par API Gateway). Absente sur les routes publiques. */
  identite?: Identite;
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
  /** Origines autorisées pour les routes d'administration, par exemple `https://admin.horsfiltre.fr`. */
  originesAdministration?: readonly string[];
  /** Branchés sur l'envoi des e-mails au lot 6c. Une erreur ici ne fait jamais échouer la requête. */
  /** `origine` : le site sur lequel la personne a réservé (jamais une origine non autorisée) ; les liens de l'e-mail y reviennent. */
  apresReservation?: (evt: { reservation: Reservation; jeton: string; origine?: string }) => Promise<void>;
  /** `message` n'existe que pour une annulation décidée par l'équipe : il est destiné à la personne. */
  apresAnnulation?: (evt: { reservation: Reservation; message?: string; parAdministrateur: boolean; origine?: string }) => Promise<void>;
  /** `jeton` : un NOUVEAU lien, signé avec le nouvel horaire (l'ancien expire avec l'ancien créneau). */
  apresReport?: (evt: { reservation: Reservation; jeton: string; ancienDebut: string; origine?: string }) => Promise<void>;
  /** Journal structuré. Ne reçoit jamais d'adresse e-mail, de prénom ni de numéro de téléphone. */
  journal?: (evenement: Record<string, unknown>) => void;
};

export const TAILLE_MAX_CORPS = 8192;
export const FORMAT_CLE_IDEMPOTENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ID = '([0-9A-HJKMNP-TV-Z]{26})';

// ------------------------------------------------------------------------------------------------ réponses

export const ENTETES_COMMUNS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } as const;

export function json(statut: number, donnees: unknown, entetes: Record<string, string> = {}): Reponse {
  return { statut, entetes: { ...ENTETES_COMMUNS, 'content-type': 'application/json; charset=utf-8', ...entetes }, corps: JSON.stringify(donnees) };
}

/** Format « problem details » (RFC 9457), comme le contrat d'API. `erreurs` donne un message par champ. */
export function probleme(statut: number, code: string, titre: string, extra: Record<string, unknown> = {}, entetes: Record<string, string> = {}): Reponse {
  const corps = { type: `https://horsfiltre.fr/erreurs/${code.replaceAll('_', '-')}`, title: titre, status: statut, code, ...extra };
  return { statut, entetes: { ...ENTETES_COMMUNS, 'content-type': 'application/problem+json; charset=utf-8', ...entetes }, corps: JSON.stringify(corps) };
}

const ERREURS_METIER: Record<string, { statut: number; titre: string }> = {
  creneau_indisponible: { statut: 409, titre: "Ce créneau vient d'être pris." },
  adresse_injoignable: { statut: 422, titre: "Nous n'arrivons pas à joindre cette adresse e-mail. Essayez-en une autre, ou écrivez-nous à contact@horsfiltre.fr." },
  trop_de_reservations: { statut: 409, titre: 'Vous avez déjà un échange réservé. Annulez-le ou reportez-le depuis votre e-mail de confirmation.' },
  reservation_deja_annulee: { statut: 409, titre: 'Cette réservation est déjà annulée.' },
  reservation_passee: { statut: 409, titre: 'Cet échange a déjà commencé : il ne peut plus être modifié.' },
  reservation_introuvable: { statut: 404, titre: 'Réservation introuvable.' },
  jeton_invalide: { statut: 403, titre: "Ce lien n'est pas valide." },
  jeton_expire: { statut: 403, titre: 'Ce lien a expiré.' },
};

export function depuisErreurMetier(e: ErreurMetier): Reponse {
  if (e.code === 'creneau_introuvable') {
    return probleme(422, 'donnees_invalides', 'Certaines informations sont à corriger.', { erreurs: { creneauId: "Ce créneau n'existe pas : rechargez la page." } });
  }
  const connue = ERREURS_METIER[e.code];
  return connue ? probleme(connue.statut, e.code, connue.titre) : probleme(500, 'erreur_interne', "Une erreur s'est produite. Réessayez dans un instant.");
}

// ------------------------------------------------------------------------------------------------ CORS

export function motifOrigine(motif: string): RegExp {
  // Tous les caractères spéciaux sont neutralisés, étoile comprise ; chaque étoile désigne ensuite UN sous-domaine
  // (lettres, chiffres, tirets), jamais un point ni une barre oblique.
  const echappe = motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${echappe.replaceAll('\\*', '[a-z0-9-]+')}$`, 'i');
}

/** L'origine de la requête si elle est autorisée, sinon rien : un en-tête Origin ne fait jamais confiance à lui seul. */
export function origineAutorisee(origine: string | undefined, autorisees: readonly string[]): string | undefined {
  return origine && autorisees.some((m) => motifOrigine(m).test(origine)) ? origine : undefined;
}

export function enTetesCors(origine: string | undefined, autorisees: readonly string[]): Record<string, string> {
  if (!origine || !autorisees.some((m) => motifOrigine(m).test(origine))) return {};
  // Sans cette liste, un navigateur ne laisse pas la page lire ces en-têtes : elle ne saurait ni quand réessayer après
  // un 503, ni qu'une réservation rejouée est la même.
  return { 'access-control-allow-origin': origine, 'access-control-expose-headers': 'retry-after, idempotent-replayed', vary: 'Origin' };
}

// ------------------------------------------------------------------------------------------------ routes

export type Contexte = { deps: DependancesHttp; req: Requete; parametres: string[]; maintenant: Date };
export type Route = { methode: string; motif: RegExp; nom: string; /** Réservée aux membres du groupe des administrateurs. */ admin?: boolean; traiter: (c: Contexte) => Promise<Reponse> };

export function lireJson(req: Requete): { ok: true; valeur: unknown } | { ok: false; reponse: Reponse } {
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

export async function prevenir(deps: DependancesHttp, fn: (() => Promise<void>) | undefined, nom: string): Promise<void> {
  if (!fn) return;
  try {
    await fn();
  } catch (e) {
    deps.journal?.({ niveau: 'erreur', evenement: 'effet_apres_requete_en_echec', effet: nom, erreur: e instanceof Error ? e.name : 'inconnue' });
  }
}

export const GROUPE_ADMINISTRATEURS = 'administrateurs';

/**
 * API Gateway transmet les groupes Cognito d'un jeton sous la forme d'un tableau, ou d'une chaîne « [a b] »
 * (HTTP API). Les deux sont lues ; toute autre valeur donne une liste vide.
 */
export function groupesDepuisClaim(valeur: unknown): string[] {
  if (Array.isArray(valeur)) return valeur.filter((g): g is string => typeof g === 'string');
  if (typeof valeur !== 'string') return [];
  const brut = valeur.trim();
  const interieur = brut.startsWith('[') && brut.endsWith(']') ? brut.slice(1, -1) : brut;
  return interieur.split(/[\s,]+/).map((g) => g.replace(/^"|"$/g, '')).filter(Boolean);
}
