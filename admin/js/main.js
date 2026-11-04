import { creerSession } from './connexion.js';
import { creerClient, ErreurApi, messageErreur } from './api.js';
import { h, lienCourriel } from './dom.js';
import { libelleJour, heureParis } from './paris.js';

const SECTIONS = {
  reservations: () => import('./vues/reservations.js'),
  creneaux: () => import('./vues/creneaux.js'),
  disponibilites: () => import('./vues/disponibilites.js'),
  equipe: () => import('./vues/equipe.js'),
};
const $ = (id) => document.getElementById(id);

async function demarrer() {
  const config = await (await fetch('/config.json', { cache: 'no-store' })).json();
  const session = creerSession({ config });

  let etat;
  try {
    etat = await session.demarrer();
  } catch (e) {
    $('contenu').replaceChildren(
      h('h2', {}, 'Connexion impossible'),
      h('p', {}, e.message === 'access_denied' ? "L'accès a été refusé." : "La connexion n'a pas abouti. Réessayez."),
      h('button', { type: 'button', onclick: () => session.reconnecter() }, 'Se reconnecter'),
    );
    return;
  }
  if (etat === 'redirige') return;

  const revendications = session.revendications();
  if (!revendications.groupes.includes('administrateurs')) {
    $('contenu').replaceChildren(h('h2', {}, 'Accès refusé'), h('p', {}, "Votre compte n'est pas membre du groupe des administrateurs."), h('button', { type: 'button', class: 'secondaire', onclick: () => session.deconnecter() }, 'Se déconnecter'));
    return;
  }

  $('session').textContent = revendications.courriel ?? 'Administrateur';
  $('deconnexion').hidden = false;
  $('deconnexion').addEventListener('click', () => session.deconnecter());
  $('nav').hidden = false;

  const api = creerClient({ base: config.api, jeton: () => session.jeton(), rafraichir: () => session.rafraichir() });
  let accompagnantsEnMemoire;

  const dialogue = $('dialogue');
  const ctx = {
    api, config,
    accompagnants: () => (accompagnantsEnMemoire ??= api.get('/v1/admin/accompagnants')),
    oublierAccompagnants: () => { accompagnantsEnMemoire = undefined; },
    annoncer(message) { $('erreurs').replaceChildren(); $('annonces').textContent = message; },
    signaler(e) {
      $('annonces').replaceChildren();
      if (e instanceof ErreurApi && e.statut === 401) { session.reconnecter(); return; }
      $('erreurs').textContent = e instanceof ErreurApi && e.statut === 403 ? "Votre compte n'est pas autorisé à faire cela." : messageErreur(e);
    },
    effacerMessages() { $('annonces').replaceChildren(); $('erreurs').replaceChildren(); },
    /** Ouvre la boîte de dialogue avec le contenu donné ; rend une fonction qui la ferme. */
    dialogue(titre, ...contenu) {
      dialogue.replaceChildren(h('h2', { id: 'dialogue-titre' }, titre), ...contenu);
      if (!dialogue.open) dialogue.showModal();
      return () => dialogue.close();
    },
    async actualiserConflits() {
      try {
        const reservations = await api.get('/v1/admin/conflits');
        $('conflits').replaceChildren(...(reservations.length ? [bandeauConflits(reservations, ctx)] : []));
      } catch (e) { ctx.signaler(e); }
    },
  };

  let sectionCourante;
  async function afficher() {
    const nom = Object.hasOwn(SECTIONS, location.hash.slice(1)) ? location.hash.slice(1) : 'reservations';
    for (const lien of $('nav').querySelectorAll('a')) {
      if (lien.getAttribute('href') === `#${nom}`) lien.setAttribute('aria-current', 'page');
      else lien.removeAttribute('aria-current');
    }
    ctx.effacerMessages();
    sectionCourante = nom;
    const contenu = $('contenu');
    contenu.replaceChildren(h('p', { class: 'discret' }, 'Chargement…'));
    try {
      const module = await SECTIONS[nom]();
      if (sectionCourante !== nom) return;
      contenu.replaceChildren();
      await module.monter(contenu, ctx);
    } catch (e) { ctx.signaler(e); }
    contenu.focus({ preventScroll: true });
  }
  addEventListener('hashchange', afficher);
  ctx.actualiserConflits();
  await afficher();
}

function bandeauConflits(reservations, ctx) {
  const n = reservations.length;
  return h('div', { class: 'bandeau', role: 'region', 'aria-label': 'Réservations à traiter' },
    h('p', {}, `${n} réservation${n > 1 ? 's ne correspondent' : ' ne correspond'} plus aux disponibilités : un rendez-vous pris reste pris, c'est à l'équipe de décider.`),
    h('button', { type: 'button', class: 'secondaire', onclick: () => {
      const fermer = ctx.dialogue('Réservations à traiter',
        h('ul', { class: 'simple' }, reservations.map((r) => h('li', {},
          h('div', { class: 'titre' }, `${libelleJour(r.debut)} · ${heureParis(r.debut)}`),
          h('div', {}, `${r.prenom} · `, lienCourriel(r.email), r.whatsapp ? ` · ${r.whatsapp}` : ''),
        ))),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'secondaire', onclick: () => { fermer(); location.hash = '#reservations'; } }, 'Voir les réservations'), h('button', { type: 'button', onclick: () => fermer() }, 'Fermer')));
    } }, 'Voir lesquelles'));
}

demarrer().catch(() => { $('contenu').replaceChildren(h('p', {}, "L'application n'a pas pu démarrer. Rechargez la page.")); });
