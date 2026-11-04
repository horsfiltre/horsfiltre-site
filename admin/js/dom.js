// Construction du DOM sans jamais passer par du HTML : tout texte, y compris celui d'un candidat, reste du texte.
export function h(balise, proprietes = {}, ...enfants) {
  const el = document.createElement(balise);
  for (const [nom, valeur] of Object.entries(proprietes ?? {})) {
    if (valeur == null || valeur === false) continue;
    if (nom === 'class') el.className = valeur;
    else if (nom.startsWith('on') && typeof valeur === 'function') el.addEventListener(nom.slice(2).toLowerCase(), valeur);
    else if (valeur === true) el.setAttribute(nom, '');
    else el.setAttribute(nom, String(valeur));
  }
  el.append(...enfants.flat(Infinity).filter((e) => e != null && e !== false).map((e) => (e instanceof Node ? e : document.createTextNode(String(e)))));
  return el;
}

/** Un lien mailto seulement pour une adresse d'allure sûre ; sinon, le texte seul. */
export function lienCourriel(adresse) {
  return /^[^\s@<>"'()]+@[^\s@<>"'()]+$/.test(adresse) ? h('a', { href: `mailto:${adresse}` }, adresse) : document.createTextNode(adresse);
}

/** Un lien de visioconférence seulement s'il pointe bien vers Google Meet. */
export function lienVisio(adresse) {
  return /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/.test(adresse) ? h('a', { href: adresse, rel: 'noopener noreferrer', target: '_blank' }, adresse) : document.createTextNode(adresse);
}

let compteur = 0;
/** Un champ de formulaire avec son étiquette, reliés par un identifiant. */
export function champ(libelle, controle, options = {}) {
  const id = `champ-${++compteur}`;
  controle.id = id;
  return h('label', { for: id, class: options.large ? 'large' : '' }, libelle, controle);
}
