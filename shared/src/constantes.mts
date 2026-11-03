// Règles de la réservation, décidées par l'équipe le 1er novembre 2026 (docs/sources/00-decisions-equipe).
// Elles sont écrites ici une seule fois : l'API, l'administration et les tests les partagent.

export const FUSEAU = 'Europe/Paris';

/** Durée d'un premier échange. */
export const DUREE_MINUTES = 30;
/** Pause entre deux échanges d'un même accompagnant (décision D5). */
export const PAUSE_MINUTES = 15;
/** Délai minimum entre la réservation et le créneau (décision D3). */
export const DELAI_MINIMUM_HEURES = 12;
/** Horizon de réservation : trois semaines (décision D4). */
export const HORIZON_JOURS = 21;
/** Durée de validité du lien d'annulation et de report après le début du créneau. */
export const VALIDITE_JETON_APRES_DEBUT_HEURES = 24;
/** [À VALIDER] Nombre de réservations actives par adresse e-mail : évite qu'une personne accapare les créneaux. */
export const MAX_RESERVATIONS_ACTIVES_PAR_EMAIL = 1;

export const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;
export type Jour = (typeof JOURS)[number];

export const RECHERCHES = ['alternance', 'stage', 'cdi', 'cdd', 'freelance', 'orientation'] as const;
export type Recherche = (typeof RECHERCHES)[number];

export const CANAUX = ['visio', 'whatsapp'] as const;
export type Canal = (typeof CANAUX)[number];
