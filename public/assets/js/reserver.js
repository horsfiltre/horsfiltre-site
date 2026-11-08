// Réserver un échange gratuit (spécification 9.12, contrat OpenAPI). Le serveur a toujours le dernier mot.
import { decrireRefus422 } from './refus.js';
import { reserver, nouvelleCle, ErreurApi, DEMO, FERME, RECHERCHES } from './api.js';
import { creerSelecteur } from './agenda.js';
import { heure, heureLocale, jour, majuscule, fuseauVisiteur } from './temps.js';
import * as turnstile from './turnstile.js';

const d = document, $ = (s, r = d) => r.querySelector(s), $$ = (s, r = d) => [...r.querySelectorAll(s)];
const form = $('#resa'), resume = $('.err-summary', form), statut = $('#resa-statut');
const q = new URLSearchParams(location.search);
if (DEMO) $('.demo-banner')?.removeAttribute('hidden');

/** Un paragraphe : un texte, puis l'adresse de contact en lien. Construit sans HTML. */
function avecContact(texte) {
  const p = d.createElement('p'), a = d.createElement('a');
  a.href = 'mailto:contact@horsfiltre.fr'; a.textContent = 'contact@horsfiltre.fr';
  p.append(texte, a, '.');
  return p;
}

/* ---------- 1 et 2 : le jour, puis l'heure ---------- */
const recap = $('[data-recap]'), barre = $('.sticky-bar');
const sel = creerSelecteur($('[data-agenda]'), {
  preselection: q.get('creneau'),
  surChoix: (c) => {
    effacer('creneau');
    if (!c) { recap.hidden = true; if (barre) barre.hidden = true; return; }
    const dt = new Date(c.debut), fin = new Date(c.fin), loc = heureLocale(dt);
    $('[data-recap-quand]').textContent = `${majuscule(jour(dt))}, ${heure(dt)} à ${heure(fin)}`;
    $('[data-recap-qui]').textContent = `avec ${c.accompagnant.prenom}, heure de Paris${loc ? ` (${loc})` : ''}`;
    recap.hidden = false;
    if (barre) { $('[data-barre-quand]', barre).textContent = `${majuscule(jour(dt)).replace(/^(\S+) /, '$1 ')}, ${heure(dt)}`; barre.hidden = false; }
    cleCourante = null;
  },
});
// Le formulaire se montre une fois la liste chargée (ou en erreur, pour que l'erreur et « Réessayer » soient visibles).
const reveler = () => form.removeAttribute('data-chargement');
if (FERME) {
  // Pas d'API pour cette adresse : la réservation n'est pas ouverte ici. On le dit, sans rien simuler.
  form.hidden = true; $('[data-ferme]').hidden = false; reveler();
} else {
  sel.charger().then(() => { reveler(); if (q.get('creneau') && sel.choisi) $('#prenom').focus({ preventScroll: false }); }).catch(() => { reveler(); $('[data-erreur-agenda]').hidden = false; });
}
// Plus aucun créneau : on le dit, avec un moyen de nous joindre (la liste d'attente viendra après l'ouverture).
$('[data-agenda]').addEventListener('agenda:vide', () => { $('[data-complet]').hidden = false; form.hidden = true; });
$('[data-recharger]')?.addEventListener('click', () => { $('[data-erreur-agenda]').hidden = true; sel.charger().then(reveler).catch(() => { $('[data-erreur-agenda]').hidden = false; }); });

/* ---------- 3 : les coordonnées ---------- */
const champs = { prenom: $('#prenom'), email: $('#email'), whatsapp: $('#whatsapp'), motivation: $('#motivation') };
const recherche = () => $('input[name="recherche"]:checked', form)?.value || '';
const canal = () => $('input[name="canal"]:checked', form)?.value || '';
const pre = q.get('recherche') || window.HF?.recherche?.();
if (RECHERCHES.includes(pre)) { const r = $(`input[name="recherche"][value="${pre}"]`, form); if (r) r.checked = true; }
const zoneWa = $('[data-whatsapp-champ]');
const majCanal = () => { zoneWa.hidden = canal() !== 'whatsapp'; champs.whatsapp.required = canal() === 'whatsapp'; };
$$('input[name="canal"]', form).forEach((r) => r.addEventListener('change', () => { majCanal(); effacer('canal'); }));
majCanal();
// Turnstile se prépare quand la personne commence à écrire : invisible le plus souvent
form.addEventListener('focusin', (e) => { if (e.target.closest('[data-coordonnees]')) turnstile.preparer($('#turnstile')).catch(() => {}); }, { once: false });

// Le résultat du test, joint seulement si la personne le choisit (aucune case de consentement : un bouton explicite)
try {
  const diag = JSON.parse(sessionStorage.getItem('hf:diagnostic') || 'null');
  const bloc = $('[data-diagnostic]');
  if (diag && bloc) {
    bloc.hidden = false;
    $('[data-diag-score]', bloc).textContent = `${diag.score} sur 100`;
    $('button', bloc).addEventListener('click', (e) => {
      const t = champs.motivation; t.value = (t.value ? t.value.trim() + '\n' : '') + diag.resume; t.value = t.value.slice(0, 500);
      e.currentTarget.disabled = true; e.currentTarget.textContent = 'Ajouté à votre message';
      majCompteur();
    });
  }
} catch { /* */ }
const compteur = $('[data-compteur]');
const majCompteur = () => { if (compteur) compteur.textContent = `${champs.motivation.value.length} / 500`; };
champs.motivation.addEventListener('input', majCompteur); majCompteur();

/* ---------- validation, comme le serveur ---------- */
const MESSAGES = {
  creneau: 'Choisissez un jour, puis une heure.',
  prenom: 'Indiquez votre prénom.',
  email: 'Indiquez une adresse e-mail complète, par exemple prenom@exemple.fr.',
  recherche: 'Dites-nous ce que vous cherchez.',
  canal: 'Choisissez la visio ou WhatsApp.',
  whatsapp: 'Indiquez un numéro WhatsApp complet, par exemple 06 12 34 56 78.',
  motivation: 'Votre message dépasse 500 caractères.',
};
const numeroWa = (v) => { let n = v.replace(/[\s.\-()]/g, ''); if (/^0[67]\d{8}$/.test(n)) n = '+33' + n.slice(1); return n; };
function valider() {
  const e = [];
  if (!sel.choisi) e.push(['creneau', MESSAGES.creneau]);
  const p = champs.prenom.value.trim(); if (!p || p.length > 60) e.push(['prenom', MESSAGES.prenom]);
  const m = champs.email.value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m) || m.length > 120) e.push(['email', MESSAGES.email]);
  if (!recherche()) e.push(['recherche', MESSAGES.recherche]);
  if (!canal()) e.push(['canal', MESSAGES.canal]);
  if (canal() === 'whatsapp' && !/^\+?[0-9]{8,15}$/.test(numeroWa(champs.whatsapp.value))) e.push(['whatsapp', MESSAGES.whatsapp]);
  if (champs.motivation.value.length > 500) e.push(['motivation', MESSAGES.motivation]);
  return e;
}
const cible = (champ) => ({ creneau: $('[data-agenda] input:not(:disabled)'), recherche: $('input[name="recherche"]', form), canal: $('input[name="canal"]', form) }[champ] || champs[champ]);
function montrerErreurs(liste) {
  for (const [champ, texte] of liste) {
    const el = $(`#err-${champ}`); if (el) el.textContent = texte;
    const c = champs[champ]; if (c) c.setAttribute('aria-invalid', 'true');
  }
  const ul = $('ul', resume); ul.textContent = '';
  for (const [champ, texte] of liste) {
    const li = d.createElement('li'), a = d.createElement('a');
    a.href = `#${cible(champ)?.id || 'resa'}`; a.textContent = texte;
    a.addEventListener('click', (ev) => { ev.preventDefault(); cible(champ)?.focus(); });
    li.append(a); ul.append(li);
  }
  resume.hidden = false; resume.focus();
}
function effacer(champ) { const el = $(`#err-${champ}`); if (el) el.textContent = ''; champs[champ]?.removeAttribute('aria-invalid'); }
Object.keys(champs).forEach((k) => champs[k]?.addEventListener('input', () => effacer(k)));
$$('input[name="recherche"]', form).forEach((r) => r.addEventListener('change', () => effacer('recherche')));

/* ---------- envoi : clé d'idempotence, 10 s au plus, chaque réponse a son message ---------- */
let cleCourante = null, envoi = false;
const bouton = $('button[type="submit"]', form);
function dire(texte, type = 'info', html = null) {
  statut.className = `notice notice-${type}`; statut.hidden = !texte && !html;
  statut.textContent = ''; if (html) statut.append(html); else statut.textContent = texte;
}
async function envoyer(tentative = 0) {
  const c = sel.choisi;
  cleCourante = cleCourante || nouvelleCle();
  // Le contrôle anti-robot peut ne pas se charger (bloqueur, réseau d'entreprise) : on le dit, au lieu de ne rien afficher.
  let jetonTurnstile;
  try {
    jetonTurnstile = await turnstile.obtenir();
  } catch {
    dire('', 'ko', avecContact('La vérification anti-robot n’a pas pu se charger, rien n’a été réservé. Vérifiez votre connexion ou désactivez un bloqueur pour ce site, puis réessayez. Vous pouvez aussi nous écrire : '));
    return;
  }
  const demande = {
    creneauId: c.id, prenom: champs.prenom.value.trim(), email: champs.email.value.trim(), recherche: recherche(), canal: canal(),
    ...(canal() === 'whatsapp' ? { whatsapp: numeroWa(champs.whatsapp.value) } : {}),
    ...(champs.motivation.value.trim() ? { motivation: champs.motivation.value.trim().slice(0, 500) } : {}),
    fuseau: fuseauVisiteur(), turnstile: jetonTurnstile,
  };
  try {
    const r = await reserver(demande, cleCourante);
    sessionStorage.setItem('hf:reservation', JSON.stringify({ ...r, canal: demande.canal, prenomCandidat: demande.prenom, whatsapp: demande.whatsapp || null, email: demande.email }));
    window.dispatchEvent(new CustomEvent('hf:mesure', { detail: { evenement: 'reservation_confirmee', depuis: q.get('depuis') || '' } }));
    bouton.textContent = 'Échange réservé';
    location.assign('/reserver/confirmation/');
  } catch (e) {
    turnstile.renouveler();
    if (!(e instanceof ErreurApi)) throw e;
    if (e.status === 409 && e.code === 'creneau_indisponible') {
      cleCourante = null;
      await sel.charger().catch(() => {});
      const proches = sel.plusProches(c.debut);
      const frag = d.createElement('div'), p = d.createElement('p'), fort = d.createElement('strong'), rangee = d.createElement('div');
      fort.textContent = 'Ce créneau vient d’être réservé par quelqu’un d’autre.';
      p.append(fort, ' Les plus proches :'); rangee.className = 'row proches'; frag.append(p, rangee);
      for (const p of proches) {
        const b = d.createElement('button'); b.type = 'button'; b.className = 'btn btn-secondary btn-s';
        const dt = new Date(p.debut); b.textContent = `${majuscule(jour(dt))}, ${heure(dt)}`;
        b.addEventListener('click', () => { sel.selectionner(p.id); dire(''); bouton.focus(); });
        $('.proches', frag).append(b);
      }
      dire('', 'wip', frag);
    } else if (e.status === 409) {
      dire('Vous avez déjà un échange prévu. Pour le changer, utilisez le lien de votre e-mail de confirmation.', 'wip');
    } else if (e.status === 422) {
      const refus = decrireRefus422(e);
      if (refus.type === 'champs') montrerErreurs(Object.entries(e.erreurs).map(([k, v]) => [k, MESSAGES[k] || String(v)]));
      // Un message envoyé à cette adresse a rebondi : on le dit près du champ, jamais sous l'étiquette du contrôle anti-robot.
      else if (refus.type === 'adresse_injoignable') montrerErreurs([['email', 'Nous n’arrivons pas à joindre cette adresse e-mail. Essayez-en une autre, ou écrivez-nous à contact@horsfiltre.fr.']]);
      else if (refus.type === 'robot') dire('La vérification anti-robot a échoué. Réessayez : elle se relance toute seule.', 'wip');
      else dire('', 'ko', avecContact('Rien n’a été réservé. Réessayez, ou écrivez-nous : '));
    } else if (e.status === 429) {
      dire('Trop de tentatives d’affilée. Réessayez dans une minute.', 'wip');
    } else if (e.status === 503 && tentative === 0) {
      dire('Vérification en cours, un instant…', 'info');
      await new Promise((ok) => setTimeout(ok, Math.min(8, e.retryAfter || 3) * 1000));
      return envoyer(1); // même clé d'idempotence : jamais de double réservation
    } else {
      dire('', 'ko', avecContact('La connexion a échoué, rien n’a été réservé. Réessayez, ou écrivez-nous : '));
    }
  }
}
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (envoi) return;
  resume.hidden = true; dire('');
  if ($('#site-web', form)?.value) return; // champ piège : un robot l'a rempli
  const erreurs = valider();
  if (erreurs.length) { montrerErreurs(erreurs); return; }
  envoi = true; bouton.setAttribute('aria-disabled', 'true'); bouton.textContent = 'Réservation en cours…';
  try { await envoyer(); } finally { envoi = false; bouton.removeAttribute('aria-disabled'); if (bouton.textContent !== 'Échange réservé') bouton.textContent = 'Réserver l’échange'; }
});
$('[data-barre-action]')?.addEventListener('click', () => { const p = champs.prenom; p.scrollIntoView({ block: 'center' }); p.focus({ preventScroll: true }); });
if (barre && 'IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => barre.classList.toggle('is-cachee', e.isIntersecting), { rootMargin: '0px 0px -10% 0px' }).observe($('[data-coordonnees]'));
}
