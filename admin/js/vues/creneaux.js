import { h, champ } from '../dom.js';
import { aujourdhuiParis, ajouterJours, libelleJour, heureParis, instantParis } from '../paris.js';

const STATUTS = { libre: 'Libre', ferme: 'Fermé', reserve: 'Réservé', passe: 'Passé' };

export async function monter(el, ctx) {
  const accompagnants = await ctx.accompagnants();
  const prenomDe = (id) => accompagnants.find((a) => a.id === id)?.prenom ?? id;
  const du = h('input', { type: 'date', value: aujourdhuiParis() });
  const au = h('input', { type: 'date', value: ajouterJours(aujourdhuiParis(), 13) });
  const liste = h('div');

  async function charger() {
    liste.replaceChildren(h('p', { class: 'discret' }, 'Chargement…'));
    try {
      const creneaux = await ctx.api.get('/v1/admin/creneaux', { du: du.value, au: au.value });
      if (!creneaux.length) { liste.replaceChildren(h('p', { class: 'discret' }, 'Aucun créneau sur cette période. Ajoutez une règle dans « Disponibilités ».')); return; }
      const parJour = Map.groupBy(creneaux, (c) => libelleJour(c.debut));
      liste.replaceChildren(...[...parJour].flatMap(([jour, lignes]) => [h('h3', {}, jour), ...lignes.map(ligne)]));
    } catch (e) { ctx.signaler(e); liste.replaceChildren(); }
  }

  function ligne(c) {
    let action = null;
    if (c.statut === 'libre') action = h('button', { type: 'button', class: 'secondaire', onclick: () => changer(c, 'ferme') }, 'Fermer');
    else if (c.statut === 'ferme') action = h('button', { type: 'button', class: 'secondaire', onclick: () => changer(c, 'libre') }, 'Rouvrir');
    return h('div', { class: 'carte' }, h('div', { class: 'ligne' },
      h('span', { class: 'titre' }, `${heureParis(c.debut)} – ${heureParis(c.fin)}`), h('span', {}, prenomDe(c.accompagnantId)),
      h('span', { class: `badge ${c.statut}` }, STATUTS[c.statut] ?? c.statut),
      c.origine === 'ponctuel' ? h('span', { class: 'discret' }, 'ajouté à la main') : null,
      c.statut === 'reserve' ? h('span', { class: 'discret' }, "voir « Réservations » pour l'annuler") : null,
      action));
  }

  async function changer(c, statut) {
    try {
      await ctx.api.patch(`/v1/admin/creneaux/${c.id}`, { statut });
      await charger();
      ctx.annoncer(statut === 'ferme' ? 'Créneau fermé : il ne sera plus proposé.' : 'Créneau rouvert.');
    } catch (e) { ctx.signaler(e); await charger(); }
  }

  const qui = h('select', {}, accompagnants.map((a) => h('option', { value: a.id }, a.prenom)));
  const date = h('input', { type: 'date', value: ajouterJours(aujourdhuiParis(), 1) });
  const heure = h('input', { type: 'time', value: '18:00', step: '300' });
  const ajout = h('details', { class: 'carte' }, h('summary', {}, 'Ajouter un créneau ponctuel'),
    h('div', { class: 'outils' }, champ('Avec', qui), champ('Date', date), champ('Heure (Paris)', heure),
      h('button', { type: 'button', onclick: async () => {
        try {
          await ctx.api.post('/v1/admin/creneaux', { accompagnantId: qui.value, debut: instantParis(date.value, heure.value) });
          await charger();
          ctx.annoncer('Créneau ajouté.');
        } catch (e) { ctx.signaler(e); }
      } }, 'Ajouter')));

  el.append(h('h2', {}, 'Créneaux'),
    h('div', { class: 'outils' }, champ('Du', du), champ('Au', au), h('button', { type: 'button', onclick: charger }, 'Afficher')),
    liste, h('h3', {}, 'Créneau ponctuel'), ajout);
  await charger();
}
