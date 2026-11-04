import { h, champ, lienCourriel } from '../dom.js';
import { aujourdhuiParis, ajouterJours, libelleJour, heureParis, instantParis, libelleCourt } from '../paris.js';

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const dateLongue = (aaaammjj) => libelleCourt(instantParis(aaaammjj, '12:00'));

export async function monter(el, ctx) {
  const accompagnants = await ctx.accompagnants();
  const prenomDe = (id) => accompagnants.find((a) => a.id === id)?.prenom ?? id;
  const optionsQui = () => accompagnants.map((a) => h('option', { value: a.id }, a.prenom));
  const regles = h('div');
  const absences = h('div');

  async function chargerRegles() {
    try {
      const liste = await ctx.api.get('/v1/admin/regles');
      regles.replaceChildren(...(liste.length ? liste.map((r) => h('div', { class: 'carte' }, h('div', { class: 'ligne' },
        h('span', { class: 'titre' }, `${prenomDe(r.accompagnantId)} · chaque ${r.jour}`), h('span', {}, `${r.debut} – ${r.fin}`),
        h('span', { class: 'discret' }, `à partir du ${dateLongue(r.valideDu)}${r.valideAu ? `, jusqu'au ${dateLongue(r.valideAu)}` : ''}`),
        h('button', { type: 'button', class: 'danger', onclick: () => supprimerRegle(r) }, 'Supprimer…')))) : [h('p', { class: 'discret' }, 'Aucune règle : aucun créneau n\'est proposé.')]));
    } catch (e) { ctx.signaler(e); }
  }

  function supprimerRegle(r) {
    const fermer = ctx.dialogue('Supprimer cette règle ?',
      h('p', {}, `${prenomDe(r.accompagnantId)}, chaque ${r.jour} de ${r.debut} à ${r.fin}.`),
      h('p', { class: 'discret' }, 'Les créneaux libres qu\'elle produit disparaissent. Les créneaux déjà réservés restent réservés : vous serez prévenue ou prévenu s\'il y en a.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'secondaire', onclick: () => fermer() }, 'Retour'),
        h('button', { type: 'button', class: 'danger', onclick: async () => {
          try { await ctx.api.supprimer(`/v1/admin/regles/${r.id}`); fermer(); await Promise.all([chargerRegles(), ctx.actualiserConflits()]); ctx.annoncer('Règle supprimée.'); }
          catch (e) { fermer(); ctx.signaler(e); }
        } }, 'Supprimer')));
  }

  async function chargerAbsences() {
    try {
      const liste = await ctx.api.get('/v1/admin/absences');
      absences.replaceChildren(...(liste.length ? liste.map((a) => h('div', { class: 'carte' }, h('div', { class: 'ligne' },
        h('span', { class: 'titre' }, prenomDe(a.accompagnantId)),
        h('span', {}, `du ${libelleCourt(a.du)} au ${libelleCourt(new Date(Date.parse(a.au) - 1).toISOString())}`),
        a.motif ? h('span', { class: 'discret' }, a.motif) : null,
        h('button', { type: 'button', class: 'danger', onclick: async () => {
          try { await ctx.api.supprimer(`/v1/admin/absences/${a.id}`); await Promise.all([chargerAbsences(), ctx.actualiserConflits()]); ctx.annoncer('Absence supprimée : les créneaux libres sont rétablis.'); }
          catch (e) { ctx.signaler(e); }
        } }, 'Supprimer')))) : [h('p', { class: 'discret' }, 'Aucune absence.')]));
    } catch (e) { ctx.signaler(e); }
  }

  // --- formulaire d'une règle
  const rQui = h('select', {}, optionsQui());
  const rJour = h('select', {}, JOURS.map((j) => h('option', { value: j }, j)));
  const rDebut = h('input', { type: 'time', value: '18:00', step: '900' });
  const rFin = h('input', { type: 'time', value: '21:00', step: '900' });
  const rDu = h('input', { type: 'date', value: aujourdhuiParis() });
  const rAu = h('input', { type: 'date' });
  const formRegle = h('div', { class: 'outils' }, champ('Accompagnant', rQui), champ('Jour', rJour), champ('De', rDebut), champ('À', rFin), champ('À partir du', rDu), champ('Jusqu\'au (facultatif)', rAu),
    h('button', { type: 'button', onclick: async () => {
      try {
        await ctx.api.post('/v1/admin/regles', { accompagnantId: rQui.value, jour: rJour.value, debut: rDebut.value, fin: rFin.value, valideDu: rDu.value, ...(rAu.value ? { valideAu: rAu.value } : {}) });
        await chargerRegles();
        ctx.annoncer('Règle ajoutée : les créneaux apparaissent aussitôt.');
      } catch (e) { ctx.signaler(e); }
    } }, 'Ajouter la règle'));

  // --- formulaire d'une absence (jours entiers)
  const aQui = h('select', {}, optionsQui());
  const aDu = h('input', { type: 'date', value: ajouterJours(aujourdhuiParis(), 1) });
  const aAu = h('input', { type: 'date', value: ajouterJours(aujourdhuiParis(), 1) });
  const aMotif = h('input', { type: 'text', maxlength: '200' });
  const formAbsence = h('div', { class: 'outils' }, champ('Accompagnant', aQui), champ('Du', aDu), champ('Au (inclus)', aAu), champ('Motif (facultatif)', aMotif),
    h('button', { type: 'button', onclick: async () => {
      try {
        const reponse = await ctx.api.post('/v1/admin/absences', {
          accompagnantId: aQui.value, du: instantParis(aDu.value, '00:00'), au: instantParis(ajouterJours(aAu.value, 1), '00:00'), ...(aMotif.value.trim() ? { motif: aMotif.value.trim() } : {}),
        });
        await Promise.all([chargerAbsences(), ctx.actualiserConflits()]);
        ctx.annoncer('Absence ajoutée : les créneaux libres de cette période sont retirés.');
        if (reponse.reservationsConcernees.length) {
          const fermer = ctx.dialogue(`${reponse.reservationsConcernees.length} rendez-vous déjà pris pendant cette absence`,
            h('p', {}, "Ils restent réservés : contactez les personnes pour reporter ou annuler (onglet « Réservations »)."),
            h('ul', { class: 'simple' }, reponse.reservationsConcernees.map((r) => h('li', {}, h('div', { class: 'titre' }, `${libelleJour(r.debut)} · ${heureParis(r.debut)}`), h('div', {}, `${r.prenom} · `, lienCourriel(r.email), r.whatsapp ? ` · ${r.whatsapp}` : '')))),
            h('div', { class: 'actions' }, h('button', { type: 'button', onclick: () => fermer() }, 'Compris')));
        }
      } catch (e) { ctx.signaler(e); }
    } }, 'Ajouter l\'absence'));

  el.append(h('h2', {}, 'Disponibilités'),
    h('h3', {}, 'Règles hebdomadaires'), regles, h('h3', {}, 'Ajouter une règle'), formRegle,
    h('h3', {}, 'Absences'), absences, h('h3', {}, 'Ajouter une absence'), formAbsence);
  await Promise.all([chargerRegles(), chargerAbsences()]);
}
