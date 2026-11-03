// Heures de Paris, avec l'heure d'été. Aucune dépendance : Intl suffit.
import { FUSEAU, JOURS, type Jour } from './constantes.mts';

const formatDecalage = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU,
  timeZoneName: 'longOffset',
  year: 'numeric',
});
const formatDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Décalage de Paris par rapport à UTC, en millisecondes, à un instant donné. */
export function decalageParisMs(instantMs: number): number {
  const nom = formatDecalage.formatToParts(new Date(instantMs)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(nom);
  if (!m || !m[1]) return 0;
  const signe = m[1] === '-' ? -1 : 1;
  return signe * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FORMAT_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Instant UTC correspondant à une date et une heure murales de Paris. */
export function instantParis(date: string, heure: string): Date {
  if (!FORMAT_DATE.test(date) || !FORMAT_HEURE.test(heure)) throw new RangeError(`Date ou heure invalide : ${date} ${heure}`);
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = heure.split(':').map(Number) as [number, number];
  const naif = Date.UTC(a, m - 1, j, h, mi);
  // Deux passes : le décalage se lit à l'instant corrigé, ce qui règle les jours de changement d'heure.
  const premier = naif - decalageParisMs(naif);
  return new Date(naif - decalageParisMs(premier));
}

/** Jour civil de Paris (AAAA-MM-JJ) d'un instant. */
export function dateParis(instant: Date): string {
  return formatDate.format(instant);
}

export function jourDeLaSemaine(date: string): Jour {
  if (!FORMAT_DATE.test(date)) throw new RangeError(`Date invalide : ${date}`);
  return JOURS[new Date(`${date}T12:00:00Z`).getUTCDay()] as Jour;
}

export function ajouterJours(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ajouterMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/** Fuseau IANA valide ? Sert à écrire les heures locales du candidat dans les e-mails. */
export function fuseauValide(nom: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: nom });
    return true;
  } catch {
    return false;
  }
}
