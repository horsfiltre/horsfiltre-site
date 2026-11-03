import { createHash, randomBytes } from 'node:crypto';

// Alphabet de Crockford : sans I, L, O ni U. Même alphabet que le contrat d'API (docs/api).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32(octets: Uint8Array, longueur: number): string {
  let bits = 0;
  let valeur = 0;
  let sortie = '';
  for (const o of octets) {
    valeur = (valeur << 8) | o;
    bits += 8;
    while (bits >= 5 && sortie.length < longueur) {
      sortie += ALPHABET[(valeur >>> (bits - 5)) & 31];
      bits -= 5;
    }
    valeur &= (1 << bits) - 1;
    if (sortie.length >= longueur) break;
  }
  return sortie;
}

/** Identifiant aléatoire de 26 caractères (130 bits), pour les réservations et les règles. */
export function nouvelIdentifiant(): string {
  return base32(randomBytes(17), 26);
}

/**
 * Identifiant d'un créneau : déduit de l'accompagnant et de l'heure de début.
 * Générer deux fois le même créneau donne le même identifiant, donc jamais de doublon.
 */
export function identifiantCreneau(accompagnantId: string, debutIso: string): string {
  return base32(createHash('sha256').update(`${accompagnantId}|${debutIso}`).digest(), 26);
}

export const FORMAT_IDENTIFIANT = /^[0-9A-HJKMNP-TV-Z]{26}$/;
