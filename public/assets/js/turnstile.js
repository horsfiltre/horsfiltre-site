// Cloudflare Turnstile, chargé seulement quand la personne arrive à ses coordonnées (CSP : script-src et frame-src
// https://challenges.cloudflare.com). En démonstration, aucun appel : le jeton vaut « demo ».
import { DEMO } from './api.js';
import { CONFIG } from './config.js';

const cle = CONFIG?.turnstile || '';
let chargement = null, widget = null, jeton = '', attente = [];

function charger() {
  if (chargement) return chargement;
  chargement = new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = ok; s.onerror = () => { chargement = null; ko(new Error('turnstile')); };
    document.head.append(s);
  });
  return chargement;
}

/** Prépare le contrôle anti-robot dans le conteneur : invisible tant qu'aucune interaction n'est nécessaire. */
export async function preparer(conteneur) {
  if (DEMO || !cle || widget !== null) return;
  await charger();
  widget = window.turnstile.render(conteneur, {
    sitekey: cle, appearance: 'interaction-only', language: 'fr', action: 'reservation',
    callback: (t) => { jeton = t; attente.splice(0).forEach((f) => f(t)); },
    'expired-callback': () => { jeton = ''; },
    'error-callback': () => { jeton = ''; },
  });
}

/** Un jeton valide, en attendant le contrôle au besoin (15 s au plus). */
export async function obtenir() {
  if (DEMO) return 'demo';
  if (!cle) throw new Error('turnstile_absent'); // jamais un faux jeton hors démonstration : l'API le refuserait sans explication
  if (jeton) return jeton;
  return new Promise((ok, ko) => { attente.push(ok); setTimeout(() => ko(new Error('turnstile_delai')), 15000); });
}
/** Un jeton ne sert qu'une fois : on en redemande un après chaque envoi. */
export function renouveler() { jeton = ''; if (widget !== null && window.turnstile) window.turnstile.reset(widget); }
