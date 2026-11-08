// Où envoyer les réservations, choisi d'après l'adresse du site, et jamais d'après une balise de la page : une balise
// oubliée ne peut pas faire passer le site public en démonstration.
//   horsfiltre.fr, www.horsfiltre.fr                       : la production (api.horsfiltre.fr, widget Turnstile de production).
//   horsfiltre.pages.dev                                   : fermée. Le widget de production et le CORS de l'API ne l'acceptent pas.
//   <branche>.horsfiltre.pages.dev (aperçus de Cloudflare Pages)  : la préproduction.
//   localhost, 127.0.0.1                                           : la démonstration, ou une API locale d'essai (?api=).
//   toute autre adresse                                            : fermée.
// La démonstration (créneaux et prénoms fictifs) n'est possible que sur le poste d'un développeur.
export const PREPROD = Object.freeze({ api: 'https://pf1k43c6r3.execute-api.eu-west-3.amazonaws.com', turnstile: '0x4AAAAAAFyDSTiWkdg72d_q' });
// La clé de site de Turnstile est publique (elle s'affiche dans la page). Sa clé secrète, elle, n'est que dans le magasin de paramètres.
export const PRODUCTION = Object.freeze({ api: 'https://api.horsfiltre.fr', turnstile: '0x4AAAAAAF3XxM6OkXrbUn5I' });

const API_LOCALE = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;

export function choisirConfiguration(hote, recherche = '') {
  const h = String(hote || '').toLowerCase();
  if (h === 'horsfiltre.fr' || h === 'www.horsfiltre.fr') {
    return { mode: PRODUCTION.api ? 'reel' : 'ferme', api: PRODUCTION.api, turnstile: PRODUCTION.turnstile };
  }
  // L'adresse technique du projet : un formulaire qui ne pourrait jamais aboutir n'aurait rien à y faire.
  if (h === 'horsfiltre.pages.dev') return { mode: 'ferme', api: '', turnstile: '' };
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.horsfiltre\.pages\.dev$/.test(h)) return { mode: 'reel', api: PREPROD.api, turnstile: PREPROD.turnstile };
  if (h === 'localhost' || h === '127.0.0.1') {
    const p = new URLSearchParams(recherche);
    const api = p.get('api') || '';
    if (API_LOCALE.test(api)) return { mode: 'reel', api, turnstile: p.get('turnstile') || 'essai-local' };
    return { mode: 'demo', api: '', turnstile: '' };
  }
  return { mode: 'ferme', api: '', turnstile: '' };
}

export const CONFIG = typeof location === 'undefined' ? null : choisirConfiguration(location.hostname, location.search);
