// Les heures de l'administration sont toujours celles de Paris, quel que soit le fuseau de l'ordinateur.
const FUSEAU = 'Europe/Paris';
const decoupe = new Intl.DateTimeFormat('en-GB', { timeZone: FUSEAU, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const libelleJourFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long' });
const libelleCourtFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'short', day: 'numeric', month: 'short' });
const heureFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function parties(instant) {
  return Object.fromEntries(decoupe.formatToParts(instant).map((p) => [p.type, p.value]));
}

/** Décalage de Paris par rapport à UTC, en minutes, à un instant donné (60 l'hiver, 120 l'été). */
export function decalageMinutes(instant) {
  const p = parties(instant);
  const commeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((commeUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** « AAAA-MM-JJ » et « HH:MM » à Paris → l'instant correspondant, en ISO UTC. */
export function instantParis(date, heure) {
  const [a, m, j] = date.split('-').map(Number);
  const [h, mi] = heure.split(':').map(Number);
  const local = Date.UTC(a, m - 1, j, h, mi);
  let t = local - decalageMinutes(new Date(local)) * 60_000;
  t = local - decalageMinutes(new Date(t)) * 60_000;
  return new Date(t).toISOString();
}

export function dateParis(instant) {
  const p = parties(instant);
  return `${p.year}-${p.month}-${p.day}`;
}

export const aujourdhuiParis = (maintenant = new Date()) => dateParis(maintenant);
export const heureParis = (iso) => heureFmt.format(new Date(iso));
export const libelleJour = (iso) => libelleJourFmt.format(new Date(iso));
export const libelleCourt = (iso) => libelleCourtFmt.format(new Date(iso));

export function ajouterJours(date, n) {
  const [a, m, j] = date.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}
