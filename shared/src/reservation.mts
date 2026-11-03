// Validation d'une demande de réservation, et jeton signé du lien d'annulation et de report.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CANAUX, FUSEAU, RECHERCHES, VALIDITE_JETON_APRES_DEBUT_HEURES, type Canal, type Recherche } from './constantes.mts';
import { FORMAT_IDENTIFIANT } from './identifiants.mts';
import { fuseauValide } from './temps.mts';

export type DemandeValidee = {
  creneauId: string;
  prenom: string;
  email: string;
  recherche: Recherche;
  canal: Canal;
  whatsapp: string | null;
  motivation: string | null;
  fuseau: string;
  turnstile: string;
};

export type ResultatValidation =
  | { ok: true; valeur: DemandeValidee }
  | { ok: false; erreurs: Record<string, string> };

const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FORMAT_TELEPHONE = /^\+?\d{8,15}$/;
// Lettres de toutes les langues, accents, espace, trait d'union, apostrophe, point : rien d'autre.
const FORMAT_PRENOM = /^[\p{L}\p{M}][\p{L}\p{M}' ’.\-]*$/u;

const texte = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Les messages d'erreur sont écrits pour être affichés tels quels sous le champ concerné. */
export function validerDemande(entree: unknown): ResultatValidation {
  const e = (typeof entree === 'object' && entree !== null ? entree : {}) as Record<string, unknown>;
  const erreurs: Record<string, string> = {};

  const creneauId = texte(e.creneauId).trim();
  if (!FORMAT_IDENTIFIANT.test(creneauId)) erreurs.creneauId = 'Choisissez un jour et une heure.';

  const prenom = texte(e.prenom).replace(/\s+/g, ' ').trim();
  if (!prenom) erreurs.prenom = 'Indiquez votre prénom.';
  else if (prenom.length > 60) erreurs.prenom = 'Votre prénom est trop long (60 caractères au plus).';
  else if (!FORMAT_PRENOM.test(prenom)) erreurs.prenom = 'Votre prénom contient des caractères non autorisés.';

  const email = texte(e.email).trim().toLowerCase();
  if (!email) erreurs.email = 'Indiquez votre adresse e-mail.';
  else if (email.length > 120 || !FORMAT_EMAIL.test(email))
    erreurs.email = 'Indiquez une adresse e-mail complète, par exemple prenom@exemple.fr.';

  const recherche = texte(e.recherche) as Recherche;
  if (!RECHERCHES.includes(recherche)) erreurs.recherche = 'Choisissez ce que vous cherchez.';

  const canal = texte(e.canal) as Canal;
  if (!CANAUX.includes(canal)) erreurs.canal = 'Choisissez comment vous préférez échanger.';

  let whatsapp: string | null = null;
  if (canal === 'whatsapp') {
    const numero = texte(e.whatsapp).replace(/[\s.\-()]/g, '');
    if (!numero) erreurs.whatsapp = 'Indiquez votre numéro WhatsApp.';
    else if (!FORMAT_TELEPHONE.test(numero))
      erreurs.whatsapp = "Indiquez un numéro de 8 à 15 chiffres, avec l'indicatif si vous n'êtes pas en France.";
    else whatsapp = numero;
  }

  let motivation: string | null = null;
  if (e.motivation != null && texte(e.motivation).trim()) {
    motivation = texte(e.motivation).trim();
    if (motivation.length > 500) erreurs.motivation = 'Votre réponse est trop longue (500 caractères au plus).';
  }

  const turnstile = texte(e.turnstile).trim();
  if (!turnstile || turnstile.length > 2048) erreurs.turnstile = 'La vérification anti-robot est manquante : rechargez la page.';

  // Un fuseau inconnu n'est pas une erreur du visiteur : on écrit les heures à l'heure de Paris.
  const fuseauDemande = texte(e.fuseau).trim();
  const fuseau = fuseauDemande && fuseauDemande.length <= 64 && fuseauValide(fuseauDemande) ? fuseauDemande : FUSEAU;

  if (Object.keys(erreurs).length) return { ok: false, erreurs };
  return { ok: true, valeur: { creneauId, prenom, email, recherche, canal, whatsapp, motivation, fuseau, turnstile } };
}

/** Empreinte d'une adresse e-mail, pour retrouver ses réservations sans l'utiliser comme clé en clair. */
export function empreinteEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

const base64url = (b: Buffer): string => b.toString('base64url');

/** Lien d'annulation et de report : valable jusqu'à 24 h après le début du créneau. */
export function creerJeton(secret: string, reservationId: string, debutCreneau: Date): string {
  const expire = Math.floor(debutCreneau.getTime() / 1000) + VALIDITE_JETON_APRES_DEBUT_HEURES * 3600;
  const charge = base64url(Buffer.from(JSON.stringify({ r: reservationId, e: expire })));
  return `${charge}.${base64url(createHmac('sha256', secret).update(charge).digest())}`;
}

export type ResultatJeton = { ok: true; reservationId: string } | { ok: false; raison: 'invalide' | 'expire' };

export function verifierJeton(secret: string, jeton: string, maintenant: Date): ResultatJeton {
  const [charge, signature, ...reste] = jeton.split('.');
  if (!charge || !signature || reste.length) return { ok: false, raison: 'invalide' };
  const attendue = createHmac('sha256', secret).update(charge).digest();
  let recue: Buffer;
  try {
    recue = Buffer.from(signature, 'base64url');
  } catch {
    return { ok: false, raison: 'invalide' };
  }
  if (recue.length !== attendue.length || !timingSafeEqual(recue, attendue)) return { ok: false, raison: 'invalide' };
  try {
    const { r, e } = JSON.parse(Buffer.from(charge, 'base64url').toString('utf8')) as { r?: unknown; e?: unknown };
    if (typeof r !== 'string' || !FORMAT_IDENTIFIANT.test(r) || typeof e !== 'number') return { ok: false, raison: 'invalide' };
    if (maintenant.getTime() / 1000 > e) return { ok: false, raison: 'expire' };
    return { ok: true, reservationId: r };
  } catch {
    return { ok: false, raison: 'invalide' };
  }
}
