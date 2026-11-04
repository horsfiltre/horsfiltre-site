import { h, champ, lienVisio } from '../dom.js';

export async function monter(el, ctx) {
  await afficher(el, ctx);
}

/** Recharge les données PUIS remplace l'écran : pas de clignotement, et rien d'annoncé avant que l'écran soit à jour. */
async function afficher(el, ctx) {
  const accompagnants = await ctx.accompagnants();
  el.replaceChildren(
    h('h2', {}, 'Équipe'),
    h('p', { class: 'discret' }, 'Le lien de visioconférence de chaque accompagnant est donné aux personnes qui réservent avec lui. Utilisez le lien « Créer une réunion pour plus tard » de votre compte Google Meet.'),
    ...accompagnants.map((a) => carte(a, el, ctx)),
  );
}

function carte(a, el, ctx) {
  const saisie = h('input', { type: 'url', value: a.lienVisio, inputmode: 'url', autocomplete: 'off' });
  return h('div', { class: 'carte' },
    h('div', { class: 'ligne' }, h('span', { class: 'titre' }, a.prenom), h('span', { class: 'discret' }, `identifiant : ${a.id}`)),
    h('div', {}, 'Lien actuel : ', lienVisio(a.lienVisio)),
    h('div', { class: 'outils' }, champ('Nouveau lien Google Meet', saisie),
      h('button', { type: 'button', onclick: async () => {
        try {
          await ctx.api.patch(`/v1/admin/accompagnants/${a.id}`, { lienVisio: saisie.value.trim() });
          ctx.oublierAccompagnants();
          await afficher(el, ctx);
          ctx.annoncer(`Lien de ${a.prenom} enregistré.`);
        } catch (e) { ctx.signaler(e); }
      } }, 'Enregistrer')));
}
