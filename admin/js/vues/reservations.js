import { h, champ, lienCourriel } from '../dom.js';
import { aujourdhuiParis, ajouterJours, libelleJour, heureParis } from '../paris.js';

const STATUTS = { confirmee: 'Confirmée', annulee: 'Annulée', passee: 'Passée' };

export async function monter(el, ctx) {
  const accompagnants = await ctx.accompagnants();
  const prenomDe = (id) => accompagnants.find((a) => a.id === id)?.prenom ?? id;
  const du = h('input', { type: 'date', value: aujourdhuiParis() });
  const au = h('input', { type: 'date', value: ajouterJours(aujourdhuiParis(), 21) });
  const liste = h('div');

  async function charger() {
    liste.replaceChildren(h('p', { class: 'discret' }, 'Chargement…'));
    try {
      const reservations = await ctx.api.get('/v1/admin/reservations', { du: du.value, au: au.value });
      reservations.sort((a, b) => a.debut.localeCompare(b.debut));
      liste.replaceChildren(...(reservations.length ? reservations.map(carte) : [h('p', { class: 'discret' }, 'Aucune réservation sur cette période.')]));
    } catch (e) { ctx.signaler(e); liste.replaceChildren(); }
  }

  function carte(r) {
    return h('article', { class: `carte ${r.statut}` },
      h('div', { class: 'ligne' },
        h('span', { class: 'titre' }, `${libelleJour(r.debut)} · ${heureParis(r.debut)}`),
        h('span', { class: `badge ${r.statut}` }, STATUTS[r.statut] ?? r.statut),
        h('span', { class: 'discret' }, `avec ${prenomDe(r.accompagnantId)}`)),
      h('div', { class: 'ligne' },
        h('span', { class: 'titre' }, r.prenom), lienCourriel(r.email), r.whatsapp ? h('span', {}, r.whatsapp) : null,
        h('span', { class: 'discret' }, r.canal === 'whatsapp' ? 'Échange par WhatsApp' : 'Échange en visio')),
      h('div', { class: 'discret' }, `Recherche : ${r.recherche}`),
      r.motivation ? h('p', { class: 'motivation' }, r.motivation) : null,
      r.statut === 'confirmee' ? h('div', { class: 'actions' }, h('button', { type: 'button', class: 'danger', onclick: () => annuler(r) }, 'Annuler cet échange…')) : null);
  }

  function annuler(r) {
    const message = h('textarea', { required: true, maxlength: '1000' });
    const bouton = h('button', { type: 'button', class: 'danger' }, "Annuler l'échange");
    const fermer = ctx.dialogue(`Annuler l'échange de ${r.prenom} ?`,
      h('p', {}, `${libelleJour(r.debut)} à ${heureParis(r.debut)}. Le créneau sera libéré aussitôt.`),
      ctx.config.emailsActifs ? h('p', { class: 'discret' }, 'Ce message sera envoyé à la personne.')
        : h('p', { class: 'bandeau info' }, "L'envoi par e-mail n'est pas encore actif : écrivez à la personne vous-même, avec les coordonnées de la fiche. Le message ci-dessous est conservé avec l'annulation."),
      champ('Message pour la personne', message, { large: true }),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'secondaire', onclick: () => fermer() }, 'Retour'), bouton));
    bouton.addEventListener('click', async () => {
      if (!message.value.trim()) { message.focus(); return; }
      bouton.disabled = true;
      try {
        await ctx.api.post(`/v1/admin/reservations/${r.id}/annulation`, { message: message.value });
        fermer();
        await Promise.all([charger(), ctx.actualiserConflits()]);
        ctx.annoncer(`L'échange de ${r.prenom} est annulé, le créneau est libre.`);
      } catch (e) { bouton.disabled = false; fermer(); ctx.signaler(e); }
    });
  }

  el.append(h('h2', {}, 'Réservations'),
    h('div', { class: 'outils' }, champ('Du', du), champ('Au', au), h('button', { type: 'button', onclick: charger }, 'Afficher')),
    liste);
  await charger();
}
