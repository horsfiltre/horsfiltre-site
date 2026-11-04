/* Hors Filtre — script commun, chargé en defer sur chaque page. ~4 Ko compressé. */
(function (d, w) {
  'use strict';
  var html = d.documentElement;
  html.classList.add('js');

  /* ---------- Réduire les animations : réglage du système ou du site ---------- */
  var CLE_MOUV = 'hf:mouvement';
  function lireMouvement() { try { return localStorage.getItem(CLE_MOUV); } catch (e) { return null; } }
  var sysReduit = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (sysReduit || lireMouvement() === 'reduit') html.setAttribute('data-motion', 'reduit');
  // Le film en 3D ne vit que si les animations sont permises et WebGL2 disponible ; sinon, sa version fixe, complète.
  if (d.querySelector('.film') && html.getAttribute('data-motion') !== 'reduit' && 'WebGL2RenderingContext' in w) html.classList.add('film-live');
  w.HF = w.HF || {};
  w.HF.mouvementReduit = function () { return html.getAttribute('data-motion') === 'reduit'; };

  d.querySelectorAll('.toggle-motion').forEach(function (b) {
    b.setAttribute('aria-pressed', String(w.HF.mouvementReduit()));
    b.addEventListener('click', function () {
      var reduit = !w.HF.mouvementReduit();
      if (reduit) html.setAttribute('data-motion', 'reduit'); else html.removeAttribute('data-motion');
      try { localStorage.setItem(CLE_MOUV, reduit ? 'reduit' : 'normal'); } catch (e) {}
      d.querySelectorAll('.toggle-motion').forEach(function (x) { x.setAttribute('aria-pressed', String(reduit)); });
      w.dispatchEvent(new CustomEvent('hf:mouvement', { detail: { reduit: reduit } }));
    });
  });

  /* ---------- En-tête ---------- */
  var top = d.querySelector('.top');
  if (top) {
    var majTop = function () { top.classList.toggle('is-scrolled', w.scrollY > 4); };
    w.addEventListener('scroll', majTop, { passive: true }); majTop();
  }
  var bouton = d.querySelector('.nav-toggle'), liens = d.getElementById('menu');
  if (bouton && liens) {
    var fermer = function (rendreFocus) {
      bouton.setAttribute('aria-expanded', 'false'); liens.classList.remove('is-open');
      if (rendreFocus) bouton.focus();
    };
    bouton.addEventListener('click', function () {
      var ouvert = bouton.getAttribute('aria-expanded') === 'true';
      bouton.setAttribute('aria-expanded', String(!ouvert)); liens.classList.toggle('is-open', !ouvert);
      if (!ouvert) { var a = liens.querySelector('a'); if (a) a.focus(); }
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && bouton.getAttribute('aria-expanded') === 'true') fermer(true); });
    d.addEventListener('click', function (e) { if (!liens.contains(e.target) && !bouton.contains(e.target)) fermer(false); });
    liens.addEventListener('click', function (e) { if (e.target.closest('a')) fermer(false); });
  }

  /* ---------- Personnalisation : « Vous cherchez… », mémorisé pour la visite seulement ---------- */
  var CLE_RECH = 'hf:recherche', VALIDES = ['alternance', 'stage', 'cdi', 'cdd', 'freelance', 'orientation'];
  function lireRecherche() {
    var q = new URLSearchParams(location.search).get('recherche');
    if (VALIDES.indexOf(q) > -1) return q;
    try { var v = sessionStorage.getItem(CLE_RECH); return VALIDES.indexOf(v) > -1 ? v : null; } catch (e) { return null; }
  }
  function appliquer(v) {
    d.querySelectorAll('[data-perso]').forEach(function (el) {
      if (!el.hasAttribute('data-defaut')) el.setAttribute('data-defaut', el.textContent);
      var t = v && el.getAttribute('data-' + v);
      el.textContent = t || el.getAttribute('data-defaut');
    });
    d.querySelectorAll('a[data-perso-lien]').forEach(function (a) {
      var u = new URL(a.getAttribute('href'), location.href);
      if (v) u.searchParams.set('recherche', v); else u.searchParams.delete('recherche');
      a.setAttribute('href', u.pathname + u.search + u.hash);
    });
    d.querySelectorAll('input[name="recherche"][data-perso-choix]').forEach(function (i) { i.checked = i.value === v; });
    html.setAttribute('data-recherche', v || '');
  }
  w.HF.recherche = lireRecherche;
  w.HF.choisirRecherche = function (v) {
    try { if (v) sessionStorage.setItem(CLE_RECH, v); else sessionStorage.removeItem(CLE_RECH); } catch (e) {}
    appliquer(v);
    w.dispatchEvent(new CustomEvent('hf:recherche', { detail: { recherche: v } }));
  };
  d.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.name === 'recherche' && t.hasAttribute('data-perso-choix')) w.HF.choisirRecherche(t.value);
  });
  appliquer(lireRecherche());

  /* ---------- WhatsApp : « Une question ? », jamais au-dessus d'un bouton d'action ---------- */
  var num = (d.querySelector('meta[name="hf-whatsapp"]') || {}).content || '';
  d.querySelectorAll('[data-whatsapp]').forEach(function (a) {
    if (!num) { a.removeAttribute('hidden'); return; } // numéro [À FOURNIR] : le lien mène aux questions
    a.href = 'https://wa.me/' + num.replace(/\D/g, '') + '?text=' + encodeURIComponent(a.getAttribute('data-whatsapp') || 'Bonjour, j’ai une question sur Hors Filtre.');
    a.hidden = false;
  });
  var fab = d.querySelector('.fab');
  if (fab && !fab.hidden && 'IntersectionObserver' in w) {
    var visibles = new Set();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) visibles.add(e.target); else visibles.delete(e.target); });
      fab.classList.toggle('is-away', visibles.size > 0);
    }, { rootMargin: '-70% 0px 0px 0px' });
    d.querySelectorAll('.btn-primary, .btn-secondary, .sticky-bar, .foot').forEach(function (b) { io.observe(b); });
  }

  /* ---------- Apparitions à l'arrivée sur une section ---------- */
  if ('IntersectionObserver' in w) {
    var rv = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); rv.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    d.querySelectorAll('.reveal').forEach(function (el) { rv.observe(el); });
  } else d.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-in'); });

  /* ---------- Données vivantes de l'agenda : prochain créneau, places du mois ---------- */
  var cibles = d.querySelectorAll('[data-prochain], [data-places]');
  if (cibles.length) {
    var go = function () {
      import('/assets/js/agenda-vivant.js').then(function (m) { m.remplir(cibles); }).catch(function () {});
    };
    if ('requestIdleCallback' in w) w.requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200);
  }

  d.querySelectorAll('[data-annee]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})(document, window);
