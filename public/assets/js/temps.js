// Dates et heures, toujours affichées à l'heure de Paris (décision E2 : « 14 h 30 »).
// Aucune dépendance : Intl suffit. Les instants voyagent en ISO 8601 (UTC), comme dans le contrat d'API.
export const FUSEAU = 'Europe/Paris';
const NBSP = '\u00A0';

const fParis = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' });
const fJour = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long' });
const fJourCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'short', day: 'numeric', month: 'short' });

/** Morceaux de la date à Paris : { annee, mois, jour, heure, minute, semaine }. */
export function enParis(date) {
  const p = {};
  for (const x of fParis.formatToParts(date)) p[x.type] = x.value;
  return { annee: +p.year, mois: +p.month, jour: +p.day, heure: +p.hour % 24, minute: +p.minute, semaine: p.weekday };
}

/** « 14 h 30 », « 9 h » : format décidé par l'équipe. */
export function heure(date, fuseau = FUSEAU) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)) p[x.type] = x.value;
  const h = String(+p.hour % 24), m = p.minute;
  return m === '00' ? `${h}${NBSP}h` : `${h}${NBSP}h${NBSP}${m}`;
}

/** « jeudi 6 novembre » */
export const jour = (date) => fJour.format(date);
/** « jeu. 6 nov. » */
export const jourCourt = (date) => fJourCourt.format(date);
export const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Clé de jour à Paris, « 2026-11-06 », pour regrouper les créneaux. */
export function cleJour(date) {
  const p = enParis(date);
  return `${p.annee}-${String(p.mois).padStart(2, '0')}-${String(p.jour).padStart(2, '0')}`;
}

/** « aujourd'hui », « demain », ou le jour en toutes lettres. */
export function jourRelatif(date, maintenant = new Date()) {
  const a = cleJour(maintenant), b = cleJour(date);
  if (a === b) return 'aujourd’hui';
  const demain = new Date(maintenant.getTime() + 864e5);
  if (cleJour(demain) === b) return 'demain';
  return jour(date);
}

/** Fuseau du visiteur, s'il diffère de Paris au moment du créneau. */
export function fuseauVisiteur() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || FUSEAU; } catch { return FUSEAU; }
}
function decalage(date, fuseau) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(date)) p[x.type] = x.value;
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(date.getTime() / 6e4) * 6e4) / 6e4;
}
/** Texte « 8 h 30 chez vous » si le visiteur n'est pas à l'heure de Paris, sinon chaîne vide. */
export function heureLocale(date) {
  const z = fuseauVisiteur();
  if (z === FUSEAU || decalage(date, z) === decalage(date, FUSEAU)) return '';
  return `${heure(date, z)} chez vous`;
}

/** Instant correspondant à une heure murale de Paris (gère les changements d'heure). */
export function depuisParis(annee, mois, jourDuMois, h, min) {
  let t = Date.UTC(annee, mois - 1, jourDuMois, h, min);
  for (let i = 0; i < 2; i++) t = Date.UTC(annee, mois - 1, jourDuMois, h, min) - decalage(new Date(t), FUSEAU) * 6e4;
  return new Date(t);
}

/** « 1 200 € » avec l'espace fine insécable de la typographie française. */
export function euros(n) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n).replace(/\s/g, '\u202F') + '\u00A0€';
}

/** Fichier d'agenda (RFC 5545) : pas de lien Meet ici, il est dans l'e-mail. */
export function fichierAgenda({ id, debut, fin, titre, description }) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
  const lignes = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hors Filtre//Reservation//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${id}@horsfiltre.fr`, `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(debut)}`, `DTEND:${z(fin)}`,
    `SUMMARY:${esc(titre)}`, `DESCRIPTION:${esc(description)}`, 'ORGANIZER;CN=Hors Filtre:mailto:contact@horsfiltre.fr',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(titre)} dans 15 minutes`, 'TRIGGER:-PT15M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return new Blob([lignes.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
}

/** Lien « Ajouter à Google Agenda ». */
export function lienGoogleAgenda({ debut, fin, titre, description }) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const q = new URLSearchParams({ action: 'TEMPLATE', text: titre, dates: `${z(debut)}/${z(fin)}`, details: description, ctz: FUSEAU });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** « AAAA-MM-JJ » à Paris : le format que le contrat attend pour les paramètres du et au. */
export function dateParisIso(date) {
  const p = enParis(date);
  return `${p.annee}-${String(p.mois).padStart(2, '0')}-${String(p.jour).padStart(2, '0')}`;
}
