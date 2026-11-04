// Annuler ou reporter, depuis le lien signé de l'e-mail. Le jeton porte l'identifiant de la réservation.
// Lien recommandé : /reserver/gerer/#<jeton> (le fragment ne part jamais au serveur ni dans les journaux).
import { consulter, annuler, reporter, lireJeton, nouvelleCle, ErreurApi } from './api.js';
import { creerSelecteur } from './agenda.js';
import { heure, heureLocale, jour, majuscule } from './temps.js';

const d = document, $ = (s, r = d) => r.querySelector(s);
const jeton = decodeURIComponent((location.hash.slice(1) || location.pathname.replace(/^\/reserver\/gerer\/?/, '')).trim());
const info = jeton ? lireJeton(jeton) : null;
const zones = { charge: $('[data-charge]'), resa: $('[data-resa]'), erreur: $('[data-erreur]'), annulee: $('[data-annulee]'), report: $('[data-report]') };
const voir = (nom) => Object.entries(zones).forEach(([k, z]) => { if (z) z.hidden = k !== nom && !(nom === 'report' && k === 'resa'); });
const erreur = (t) => { $('p', zones.erreur).textContent = t; voir('erreur'); };
let resa = null;

function afficher(r) {
  resa = r;
  const dt = new Date(r.debut), fin = new Date(r.fin), loc = heureLocale(dt);
  $('[data-quand]').textContent = `${majuscule(jour(dt))}, ${heure(dt)} à ${heure(fin)}`;
  $('[data-qui]').textContent = `avec ${r.accompagnant.prenom}, ${r.canal === 'whatsapp' ? 'sur WhatsApp' : 'en visio'}${loc ? ` · ${loc}` : ''}`;
  const b = $('[data-statut-resa]');
  b.textContent = r.statut === 'confirmee' ? 'Confirmé' : r.statut === 'annulee' ? 'Annulé' : 'Passé';
  b.className = `badge ${r.statut === 'confirmee' ? 'b-ok' : r.statut === 'annulee' ? 'b-ko' : 'b-neutral'}`;
  $('[data-actions]').hidden = r.statut !== 'confirmee';
  voir(r.statut === 'annulee' ? 'annulee' : 'resa');
  if (r.statut === 'annulee') zones.resa.hidden = false;
}
async function demarrer() {
  if (!info) return erreur('Ce lien n’est pas complet. Utilisez le bouton de votre e-mail de confirmation.');
  try { afficher(await consulter(info.id, jeton)); }
  catch (e) {
    if (e instanceof ErreurApi && e.code === 'jeton_expire') return erreur('Ce lien a expiré : l’échange est passé depuis plus de 24 heures.');
    if (e instanceof ErreurApi && (e.status === 403 || e.status === 404)) return erreur('Ce lien n’est pas valide. Utilisez le bouton de votre e-mail de confirmation, ou écrivez-nous.');
    return erreur('La réservation n’a pas pu être chargée. Vérifiez votre connexion, puis rechargez la page.');
  }
}

/* annuler : une confirmation dans la page, jamais une fenêtre du navigateur */
$('[data-annuler]')?.addEventListener('click', () => { $('[data-confirmer-annulation]').hidden = false; $('[data-confirmer-annulation] button').focus(); });
$('[data-garder]')?.addEventListener('click', () => { $('[data-confirmer-annulation]').hidden = true; $('[data-annuler]').focus(); });
$('[data-oui-annuler]')?.addEventListener('click', async (ev) => {
  const b = ev.currentTarget; b.setAttribute('aria-disabled', 'true'); b.textContent = 'Annulation…';
  try { afficher(await annuler(resa.id, jeton)); $('[data-annulee] h2').focus(); }
  catch (e) { b.removeAttribute('aria-disabled'); b.textContent = 'Oui, annuler l’échange'; $('[data-message-action]').textContent = e.status === 409 ? 'Cet échange ne peut plus être annulé en ligne.' : 'L’annulation a échoué. Réessayez, ou écrivez-nous.'; }
});

/* reporter : le même sélecteur que la réservation */
let sel = null, cle = null;
$('[data-reporter]')?.addEventListener('click', async () => {
  zones.report.hidden = false; $('[data-report] h2').focus();
  if (!sel) sel = creerSelecteur($('[data-report] [data-agenda]'), { nom: 'report', surChoix: (c) => { cle = null; $('[data-valider-report]').disabled = !c; } });
  await sel.charger().catch(() => { $('[data-message-report]').textContent = 'Les créneaux n’ont pas pu être chargés.'; });
});
$('[data-valider-report]')?.addEventListener('click', async (ev) => {
  const b = ev.currentTarget, c = sel?.choisi; if (!c) return;
  cle = cle || nouvelleCle();
  b.disabled = true; b.textContent = 'Report en cours…';
  try {
    afficher(await reporter(resa.id, jeton, c.id, cle));
    zones.report.hidden = true;
    $('[data-message-action]').textContent = 'C’est noté : votre échange est déplacé. Un e-mail de confirmation part maintenant.';
    $('[data-resa] h2').focus();
  } catch (e) {
    b.disabled = false; b.textContent = 'Déplacer mon échange';
    $('[data-message-report]').textContent = e.status === 409 ? 'Ce créneau vient d’être pris. Choisissez-en un autre.' : 'Le report a échoué. Réessayez, ou écrivez-nous.';
    if (e.status === 409) { cle = null; sel.charger().catch(() => {}); }
  }
});
demarrer();
