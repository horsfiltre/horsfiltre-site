// Client des routes publiques de l'API de réservation (docs/api/reservations.openapi.yaml fait foi).
// L'API et le mode (réel, démonstration, fermé) dépendent de l'adresse du site : voir config.js.
// En démonstration, rien ne quitte le navigateur ; les prénoms et créneaux sont fictifs.
import { CONFIG } from './config.js';
import { dateParisIso, depuisParis, enParis } from './temps.js';

export const BASE = (CONFIG?.api || '').replace(/\/+$/, '');
export const DEMO = CONFIG?.mode === 'demo';
/** Aucune API pour cette adresse : la réservation n'est pas ouverte ici. Jamais de démonstration à la place. */
export const FERME = CONFIG?.mode === 'ferme';
export const DELAI_RESEAU_MS = 10_000;
export const RECHERCHES = ['alternance', 'stage', 'cdi', 'cdd', 'freelance', 'orientation'];

export class ErreurApi extends Error {
  constructor({ status = 0, code = 'inconnue', title = '', detail = '', erreurs = null, retryAfter = null } = {}) {
    super(title || code);
    Object.assign(this, { status, code, titre: title, detail, erreurs, retryAfter });
  }
}

async function appel(chemin, { methode = 'GET', corps, cle, jeton } = {}) {
  if (FERME || !BASE) throw new ErreurApi({ code: 'ferme' });
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_RESEAU_MS);
  const url = new URL(BASE + chemin);
  if (jeton) url.searchParams.set('jeton', jeton);
  const entetes = { Accept: 'application/json, application/problem+json' };
  if (corps !== undefined) entetes['Content-Type'] = 'application/json';
  if (cle) entetes['Idempotency-Key'] = cle;
  let r;
  try {
    r = await fetch(url, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps), signal: ctrl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    throw new ErreurApi({ code: e.name === 'AbortError' ? 'delai' : 'reseau' });
  } finally { clearTimeout(minuteur); }
  if (r.status === 204 || r.status === 202) return null;
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurApi({ ...json, status: r.status, code: json.code || `http_${r.status}`, retryAfter: +r.headers.get('Retry-After') || null });
  return json;
}

export const nouvelleCle = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15); return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

/** L'identifiant de réservation est lisible dans la charge du jeton (signée côté serveur, voir shared/src/reservation.mts). */
export function lireJeton(jeton) {
  try {
    const charge = jeton.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const { r, e } = JSON.parse(decodeURIComponent(escape(atob(charge + '==='.slice((charge.length + 3) % 4)))));
    return { id: String(r), expire: e ? new Date(e) : null };
  } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* Routes publiques                                                    */
/* ------------------------------------------------------------------ */
export async function creneaux(du = new Date(), au = new Date(Date.now() + 21 * 864e5)) {
  if (DEMO) return demo.creneaux(du, au);
  // Le contrat attend des jours (AAAA-MM-JJ, heure de Paris), pas des instants : un instant donnerait une erreur 400.
  const q = new URLSearchParams({ du: dateParisIso(du), au: dateParisIso(au) });
  return appel(`/v1/creneaux?${q}`);
}
export async function reserver(demande, cle) {
  if (DEMO) return demo.reserver(demande);
  return appel('/v1/reservations', { methode: 'POST', corps: demande, cle });
}
export async function consulter(id, jeton) {
  if (DEMO) return demo.consulter(id);
  return appel(`/v1/reservations/${encodeURIComponent(id)}`, { jeton });
}
export async function annuler(id, jeton) {
  if (DEMO) return demo.annuler(id);
  return appel(`/v1/reservations/${encodeURIComponent(id)}/annulation`, { methode: 'POST', jeton });
}
export async function reporter(id, jeton, creneauId, cle) {
  if (DEMO) return demo.reporter(id, creneauId);
  return appel(`/v1/reservations/${encodeURIComponent(id)}/report`, { methode: 'POST', corps: { creneauId }, cle, jeton });
}

/** Le prochain créneau libre, ou null. Sert à l'accueil, au test et aux pages de contenu. */
export async function prochainLibre() {
  const { creneaux: liste } = await creneaux();
  return liste.filter((c) => c.disponible).sort((a, b) => a.debut.localeCompare(b.debut))[0] || null;
}
/** Places d'échange encore libres d'ici la fin du mois (décision D6 : l'agenda réel, jamais une fausse rareté). */
export async function placesDuMois() {
  const maintenant = new Date(), p = enParis(maintenant);
  const fin = depuisParis(p.mois === 12 ? p.annee + 1 : p.annee, p.mois === 12 ? 1 : p.mois + 1, 1, 0, 0);
  const { creneaux: liste } = await creneaux(maintenant, new Date(fin.getTime() - 1)); // « au » est inclus : le dernier jour du mois
  return { libres: liste.filter((c) => c.disponible).length, total: liste.length, fin };
}

/* ------------------------------------------------------------------ */
/* Démonstration : créneaux générés selon les règles d'agenda décidées */
/* (30 min, 15 min de pause, 12 h de délai, 3 semaines d'horizon)      */
/* ------------------------------------------------------------------ */
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function idDe(texte) {
  let h1 = 0x811c9dc5, h2 = 0x01000193, s = '';
  for (let i = 0; i < 26; i++) {
    for (const ch of texte + i) { h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619); h2 = Math.imul(h2 + ch.charCodeAt(0), 2246822519); }
    s += CROCKFORD[(h1 ^ h2) >>> 27];
  }
  return s;
}
const lire = (k, v) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? v; } catch { return v; } };
const ecrire = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } };

export const DEMO_ACCOMPAGNANTS = [ // fictifs, pour la démonstration seulement
  { id: 'demo-alex', prenom: 'Alex', fenetres: [['lundi', '18:00', '20:15'], ['mercredi', '12:30', '14:00'], ['samedi', '10:00', '12:15']] },
  { id: 'demo-camille', prenom: 'Camille', fenetres: [['mardi', '18:00', '20:15'], ['jeudi', '18:00', '20:15'], ['dimanche', '17:00', '19:15']] },
  { id: 'demo-sam', prenom: 'Sam', fenetres: [['lundi', '12:30', '14:00'], ['vendredi', '17:30', '19:45'], ['samedi', '14:00', '16:15']] },
  { id: 'demo-noa', prenom: 'Noa', fenetres: [['mercredi', '18:00', '20:15'], ['jeudi', '12:30', '14:00'], ['dimanche', '10:00', '12:15']] },
];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function genererDemo() {
  const maintenant = Date.now(), tot = maintenant + 12 * 36e5, tard = maintenant + 21 * 864e5;
  const pris = new Set(lire('hf:demo:pris', []));
  const out = [];
  for (let d = 0; d <= 22; d++) {
    const p = enParis(new Date(maintenant + d * 864e5));
    const nom = JOURS[new Date(Date.UTC(p.annee, p.mois - 1, p.jour)).getUTCDay()];
    for (const a of DEMO_ACCOMPAGNANTS) for (const [j, de, a2] of a.fenetres) {
      if (j !== nom) continue;
      const [h1, m1] = de.split(':').map(Number), [h2, m2] = a2.split(':').map(Number);
      for (let m = h1 * 60 + m1; m + 30 <= h2 * 60 + m2; m += 45) {
        const debut = depuisParis(p.annee, p.mois, p.jour, Math.floor(m / 60), m % 60);
        if (debut.getTime() < tot || debut.getTime() > tard) continue;
        const id = idDe(a.id + debut.toISOString());
        const occupe = pris.has(id) || ((parseInt(id.slice(3, 6), 32) % 100) < 38);
        out.push({ id, debut: debut.toISOString(), fin: new Date(debut.getTime() + 30 * 6e4).toISOString(), disponible: !occupe, accompagnant: { prenom: a.prenom } });
      }
    }
  }
  return out.sort((x, y) => x.debut.localeCompare(y.debut));
}

const demo = {
  async creneaux(du, au) {
    await pause(350);
    const liste = genererDemo().filter((c) => c.debut >= du.toISOString() && c.debut <= au.toISOString());
    return { fuseau: 'Europe/Paris', genereLe: new Date().toISOString(), creneaux: liste };
  },
  async reserver(d) {
    await pause(700);
    const c = genererDemo().find((x) => x.id === d.creneauId);
    // Prénoms d'essai pour voir chaque état d'erreur : « Pris », « Lent », « Erreur ».
    if (!c || !c.disponible || /^pris$/i.test(d.prenom)) throw new ErreurApi({ status: 409, code: 'creneau_indisponible', title: 'Ce créneau vient d’être réservé.' });
    if (/^lent$/i.test(d.prenom)) throw new ErreurApi({ status: 503, code: 'verification_indisponible', title: 'Vérification indisponible.', retryAfter: 5 });
    if (/^erreur$/i.test(d.prenom)) throw new ErreurApi({ status: 0, code: 'reseau' });
    const id = idDe('resa' + c.id + Date.now());
    const r = { id, debut: c.debut, fin: c.fin, canal: d.canal, statut: 'confirmee', accompagnant: c.accompagnant, creneauId: c.id };
    ecrire('hf:demo:pris', [...lire('hf:demo:pris', []), c.id]);
    ecrire('hf:demo:resas', { ...lire('hf:demo:resas', {}), [id]: r });
    const charge = btoa(JSON.stringify({ r: id, e: new Date(new Date(c.debut).getTime() + 24 * 36e5).toISOString() })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { ...r, jetonDemo: `${charge}.demo` };
  },
  async consulter(id) {
    await pause(300);
    const r = lire('hf:demo:resas', {})[id];
    if (!r) throw new ErreurApi({ status: 404, code: 'introuvable', title: 'Réservation introuvable.' });
    return r;
  },
  async annuler(id) {
    const r = await demo.consulter(id);
    r.statut = 'annulee';
    ecrire('hf:demo:resas', { ...lire('hf:demo:resas', {}), [id]: r });
    ecrire('hf:demo:pris', lire('hf:demo:pris', []).filter((x) => x !== r.creneauId));
    return r;
  },
  async reporter(id, creneauId) {
    const r = await demo.consulter(id);
    const c = genererDemo().find((x) => x.id === creneauId);
    if (!c || !c.disponible) throw new ErreurApi({ status: 409, code: 'creneau_indisponible', title: 'Ce créneau vient d’être réservé.' });
    const pris = lire('hf:demo:pris', []).filter((x) => x !== r.creneauId);
    ecrire('hf:demo:pris', [...pris, c.id]);
    Object.assign(r, { debut: c.debut, fin: c.fin, accompagnant: c.accompagnant, creneauId: c.id, statut: 'confirmee' });
    ecrire('hf:demo:resas', { ...lire('hf:demo:resas', {}), [id]: r });
    return r;
  },
};
