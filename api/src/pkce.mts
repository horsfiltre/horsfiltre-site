// Connexion « authorization code » avec PKCE (RFC 7636) : le même flux que l'interface d'administration.
// Ces fonctions ne font aucun appel réseau.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Secret à usage unique, gardé par celui qui se connecte : 64 caractères, bien au-delà du minimum de 43. */
export function creerVerificateur(): string {
  return randomBytes(48).toString('base64url');
}

/** Empreinte du vérificateur : seule elle part dans l'adresse de connexion, jamais le vérificateur lui-même. */
export function defiDepuis(verificateur: string): string {
  return createHash('sha256').update(verificateur).digest('base64url');
}

export function creerEtat(): string {
  return randomBytes(24).toString('base64url');
}

export function urlAutorisation(p: { adresseConnexion: string; idClient: string; urlRetour: string; etat: string; defi: string }): string {
  const q = new URLSearchParams({
    response_type: 'code', client_id: p.idClient, redirect_uri: p.urlRetour, scope: 'openid email',
    state: p.etat, code_challenge: p.defi, code_challenge_method: 'S256',
  });
  return `${p.adresseConnexion.replace(/\/+$/, '')}/oauth2/authorize?${q.toString()}`;
}

export type RetourConnexion = { ok: true; code: string } | { ok: false; raison: string };

/** Lit l'adresse vers laquelle Cognito renvoie l'administrateur. Un état différent est une tentative de rejeu : refusée. */
export function lireRetour(adresse: string, etatAttendu: string): RetourConnexion {
  const params = new URL(adresse, 'http://localhost').searchParams;
  const erreur = params.get('error');
  if (erreur) return { ok: false, raison: erreur };
  const etat = Buffer.from(params.get('state') ?? '');
  const attendu = Buffer.from(etatAttendu);
  if (etat.length !== attendu.length || !timingSafeEqual(etat, attendu)) return { ok: false, raison: 'etat_different' };
  const code = params.get('code');
  return code ? { ok: true, code } : { ok: false, raison: 'code_manquant' };
}

/** Lit, sans le vérifier, ce qu'un jeton annonce. Pour l'affichage seulement : la vérification, c'est API Gateway. */
export function lireRevendications(jeton: string): { groupes: string[]; expireDansMinutes?: number } {
  try {
    const charge = JSON.parse(Buffer.from(jeton.split('.')[1] ?? '', 'base64url').toString('utf8')) as { 'cognito:groups'?: unknown; exp?: unknown };
    const groupes = Array.isArray(charge['cognito:groups']) ? charge['cognito:groups'].filter((g): g is string => typeof g === 'string') : [];
    return { groupes, ...(typeof charge.exp === 'number' ? { expireDansMinutes: Math.round((charge.exp * 1000 - Date.now()) / 60_000) } : {}) };
  } catch {
    return { groupes: [] };
  }
}
