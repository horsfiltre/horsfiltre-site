// Sélecteur de créneau accessible : deux groupes de boutons radio (le jour, puis l'heure), jamais une grille seule.
// Les créneaux pris restent visibles, désactivés. Heures de Paris, avec l'heure locale du visiteur si elle diffère.
import { creneaux as chargerCreneaux } from './api.js';
import { cleJour, heure, heureLocale, jourCourt, jour, majuscule } from './temps.js';

/** Une boîte et ses enfants vides, construits sans HTML (le texte est posé ensuite, avec textContent). */
function boite(classe, ...enfants) {
  const b = document.createElement('span'); b.className = classe;
  for (const [balise, cl] of enfants) { const e = document.createElement(balise); if (cl) e.className = cl; b.append(e); }
  return b;
}

export function creerSelecteur(racine, { nom = 'creneau', surChoix = () => {}, preselection = null } = {}) {
  const zJours = racine.querySelector('[data-jours]'), zHeures = racine.querySelector('[data-heures]');
  const etat = { liste: [], parJour: new Map(), jour: null, choisi: null };
  const statut = racine.querySelector('[data-statut]');

  function dire(t, type = '') { if (statut) { statut.textContent = t; statut.dataset.type = type; statut.hidden = !t; } }

  async function charger() {
    dire('Chargement des créneaux…', 'chargement');
    zJours.setAttribute('aria-busy', 'true');
    try {
      const { creneaux } = await chargerCreneaux();
      etat.liste = creneaux.slice().sort((a, b) => a.debut.localeCompare(b.debut));
      etat.parJour = new Map();
      for (const c of etat.liste) { const k = cleJour(new Date(c.debut)); if (!etat.parJour.has(k)) etat.parJour.set(k, []); etat.parJour.get(k).push(c); }
      dire('');
      dessinerJours();
      const libres = etat.liste.filter((c) => c.disponible);
      if (!libres.length) { racine.dispatchEvent(new CustomEvent('agenda:vide')); return etat; }
      const pre = preselection && etat.liste.find((c) => c.id === preselection && c.disponible);
      if (pre) choisirJour(cleJour(new Date(pre.debut)), pre.id);
      else choisirJour(cleJour(new Date(libres[0].debut)));
      return etat;
    } catch (e) {
      dire('Les créneaux n’ont pas pu être chargés.', 'erreur');
      racine.dispatchEvent(new CustomEvent('agenda:erreur', { detail: e }));
      throw e;
    } finally { zJours.removeAttribute('aria-busy'); }
  }

  function dessinerJours() {
    zJours.textContent = '';
    for (const [k, liste] of etat.parJour) {
      const libres = liste.filter((c) => c.disponible).length, date = new Date(liste[0].debut);
      const lab = document.createElement('label'); lab.className = 'jour';
      const inp = document.createElement('input'); inp.type = 'radio'; inp.name = `${nom}-jour`; inp.value = k; inp.disabled = libres === 0;
      const [sem, num, mois] = jourCourt(date).replace(/\./g, '').split(' ');
      lab.append(boite('j-box', ['span', 'j-sem'], ['span', 'j-num'], ['span', 'j-mois'], ['span', 'j-libres']));
      lab.prepend(inp);
      lab.querySelector('.j-sem').textContent = sem;
      lab.querySelector('.j-num').textContent = num;
      lab.querySelector('.j-mois').textContent = mois;
      lab.querySelector('.j-libres').textContent = libres ? `${libres} libre${libres > 1 ? 's' : ''}` : 'complet';
      inp.setAttribute('aria-label', `${majuscule(jour(date))}, ${libres ? `${libres} créneau${libres > 1 ? 'x' : ''} libre${libres > 1 ? 's' : ''}` : 'complet'}`);
      inp.addEventListener('change', () => choisirJour(k));
      zJours.append(lab);
    }
  }

  function choisirJour(k, idCreneau = null) {
    etat.jour = k;
    const radio = zJours.querySelector(`input[value="${k}"]`); if (radio) { radio.checked = true; radio.closest('label').scrollIntoView({ block: 'nearest', inline: 'center' }); }
    zHeures.textContent = '';
    const liste = etat.parJour.get(k) || [];
    const titre = racine.querySelector('[data-jour-titre]');
    if (titre && liste[0]) titre.textContent = majuscule(jour(new Date(liste[0].debut)));
    for (const c of liste) {
      const d = new Date(c.debut), lab = document.createElement('label'); lab.className = 'heure';
      const inp = document.createElement('input'); inp.type = 'radio'; inp.name = nom; inp.value = c.id; inp.disabled = !c.disponible;
      lab.append(boite('h-box', ['strong', ''], ['span', 'h-qui'], ['span', 'h-local']));
      lab.prepend(inp);
      lab.querySelector('strong').textContent = heure(d);
      lab.querySelector('.h-qui').textContent = c.disponible ? `avec ${c.accompagnant.prenom}` : 'pris';
      const loc = heureLocale(d); lab.querySelector('.h-local').textContent = loc;
      inp.addEventListener('change', () => { etat.choisi = c; surChoix(c); });
      if (idCreneau === c.id) { inp.checked = true; etat.choisi = c; surChoix(c); }
      zHeures.append(lab);
    }
    if (!idCreneau) { etat.choisi = null; surChoix(null); }
  }

  /** Les créneaux libres les plus proches d'un instant (après un « créneau pris entre-temps »). */
  function plusProches(iso, n = 3) {
    const t = new Date(iso).getTime();
    return etat.liste.filter((c) => c.disponible).sort((a, b) => Math.abs(new Date(a.debut) - t) - Math.abs(new Date(b.debut) - t)).slice(0, n);
  }
  function selectionner(id) { const c = etat.liste.find((x) => x.id === id); if (c) choisirJour(cleJour(new Date(c.debut)), id); }

  return { charger, plusProches, selectionner, get choisi() { return etat.choisi; }, get liste() { return etat.liste; } };
}
