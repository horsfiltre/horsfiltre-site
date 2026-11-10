import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Les pages de réservation sont ouvertes au public depuis le lot 10c : rien de ce qu'on y lit ne doit être un marqueur à remplir,
// un numéro qui n'existe pas, ni une affirmation sur une équipe qui n'existe pas encore.
const pages = (d) => readdirSync(d).flatMap((n) => { const c = join(d, n); return statSync(c).isDirectory() ? pages(c) : c.endsWith('.html') ? [c] : []; });
const PAGES = pages('public/reserver');
const lire = (f) => readFileSync(f, 'utf8');

test('réservation : il y a bien trois pages, et aucune ne contient de marqueur à remplir', () => {
  assert.equal(PAGES.length, 3, PAGES.join(', '));
  for (const f of PAGES) {
    const h = lire(f);
    assert.doesNotMatch(h, /class="todo"/i, `${f} : un marqueur en surbrillance`);
    assert.doesNotMatch(h, /\[\s*(à|a)\s+fournir/i, `${f} : « [À FOURNIR] »`);
    assert.doesNotMatch(h, /\[\s*(numéro|siret|médiateur|todo)/i, `${f} : un marqueur entre crochets`);
  }
});

test('réservation : aucun contact WhatsApp tant que le numéro de l’entreprise n’existe pas', () => {
  for (const f of PAGES) {
    const h = lire(f);
    const numero = h.match(/<meta name="hf-whatsapp" content="([^"]*)"/i)?.[1] ?? '';
    const liensWhatsApp = h.match(/\bdata-whatsapp(?![-\w])/gi) ?? [];
    if (numero === '') assert.equal(liensWhatsApp.length, 0, `${f} : un lien WhatsApp sans numéro configuré`);
    assert.doesNotMatch(h, /href="\/questions\/#whatsapp"/i, `${f} : un lien vers une page qui n'existe pas`);
  }
});

test('réservation : le champ du numéro du candidat reste là (il est appelé sur WhatsApp si c’est son choix)', () => {
  const h = lire('public/reserver/index.html');
  assert.match(h, /<input[^>]*\bid="whatsapp"/i);
  assert.match(h, /name="canal" value="whatsapp"/i);
});

test('réservation : la page n’annonce pas une équipe de quatre associés tant qu’elle n’existe pas', () => {
  // À retirer quand quatre accompagnants existent en production (docs/sources/accompagnants.txt).
  for (const f of PAGES) assert.doesNotMatch(lire(f), /quatre associés/i, f);
  assert.match(lire('public/reserver/index.html'), /Avec un membre de l’équipe de Hors Filtre, qui sera aussi votre accompagnant\./);
});

test('réservation : chaque page garde un moyen de contact réel (l’adresse e-mail), et le bouton flottant l’utilise', () => {
  for (const f of PAGES) assert.match(lire(f), /<a href="mailto:contact@horsfiltre\.fr">contact@horsfiltre\.fr<\/a>/i, f);
  assert.match(lire('public/reserver/confirmation/index.html'), /<a class="fab" href="mailto:contact@horsfiltre\.fr">/i);
});

test('réservation : le pied de page garde l’année dynamique et la marque, sans mention d’un identifiant inexistant', () => {
  for (const f of PAGES) assert.match(lire(f), /<p>© <span data-annee>\d{4}<\/span> Hors Filtre<\/p>/, f);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Lot A : une adresse e-mail fausse ne doit jamais laisser la personne sans issue (le seul canal est l'e-mail).
const CONFIRMATION = lire('public/reserver/confirmation/index.html');
const CONFIRMATION_JS = lire('public/assets/js/confirmation.js');
const RESERVER_JS = lire('public/assets/js/reserver.js');

test('confirmation : un conseil si l’e-mail n’arrive pas, avec les indésirables, et un lien de correction vers l’équipe', () => {
  const bloc = CONFIRMATION.match(/<p class="small muted" data-pas-recu>.*?<\/p>/is)?.[0] ?? '';
  assert.match(bloc, /quelques minutes/i);
  // CLAUDE.md : aucun délai sans source. Le temps d'arrivée d'un e-mail n'a jamais été mesuré : pas de chiffre dans ce conseil.
  assert.doesNotMatch(bloc, /\d|\b(cinq|dix|quinze|vingt|trente)\b/i);
  // Le produit ne sait pas « refaire » une réservation (docs/operations/adresse-incorrecte.md) : on ne le promet pas.
  assert.doesNotMatch(bloc, /refai/i);
  assert.match(bloc, /avec la bonne adresse/i);
  assert.match(bloc, /indésirables/i);
  assert.match(bloc, /<a href="mailto:contact@horsfiltre\.fr" data-mauvaise-adresse>/i);
  // l'adresse saisie reste affichée, juste au-dessus du conseil
  const iAdresse = CONFIRMATION.indexOf('<strong data-email></strong>'), iConseil = CONFIRMATION.indexOf('data-pas-recu');
  assert.ok(iAdresse >= 0 && iConseil >= 0 && iAdresse < iConseil, 'l’adresse saisie est affichée, puis le conseil');
});

test('confirmation : le lien de correction porte l’identifiant de la réservation (sans lui, l’équipe ne la retrouve pas)', () => {
  assert.match(CONFIRMATION_JS, /\[data-mauvaise-adresse\]/);
  assert.match(CONFIRMATION_JS, /mailto:contact@horsfiltre\.fr\?subject=/);
  assert.match(CONFIRMATION_JS, /Réservation : \$\{r\.id\}/);
  assert.match(CONFIRMATION_JS, /Ma bonne adresse/);
});

test('confirmation : la liste de préparation ne renvoie plus vers une page qui n’existe pas, et le partage mène à l’accueil', () => {
  const liste = CONFIRMATION.match(/<ol class="conseils">.*?<\/ol>/is)?.[0] ?? '';
  assert.ok(liste.length > 50, 'la liste existe');
  assert.doesNotMatch(liste, /href="\/test\/"/i);
  assert.doesNotMatch(liste, /test du filtre/i);
  assert.match(CONFIRMATION_JS, /const url = 'https:\/\/horsfiltre\.fr\/';/);
  assert.doesNotMatch(CONFIRMATION_JS, /horsfiltre\.fr\/parents/i);
});

test('réservation : une coupure ou un délai ne prétend jamais que rien n’a été réservé, et dit que réessayer est sans risque', () => {
  assert.doesNotMatch(RESERVER_JS, /La connexion a échoué, rien n’a été réservé/);
  assert.match(RESERVER_JS, /Votre réservation est peut-être enregistrée/);
  assert.match(RESERVER_JS, /Réessayer avec la même adresse ne crée jamais de doublon/);
  assert.match(RESERVER_JS, /regardez vos e-mails avant de réessayer/);
  // La promesse « jamais de doublon » repose sur la clé d'idempotence. Elle n'est renouvelée que dans deux cas : la personne choisit
  // un autre créneau, ou le sien vient d'être pris. Jamais sur une coupure, un délai ou une erreur serveur.
  assert.equal((RESERVER_JS.match(/cleCourante = null;/g) ?? []).length, 2, 'deux remises à zéro, pas plus');
  assert.match(RESERVER_JS, /if \(e\.status === 409 && e\.code === 'creneau_indisponible'\) \{\s*cleCourante = null;/);
  const apres503 = RESERVER_JS.split("else if (e.status === 503 && tentative === 0)")[1]?.split("form.addEventListener('submit'")[0] ?? '';
  assert.ok(apres503.includes('La connexion s’est interrompue'), 'le chemin de coupure est bien celui qu’on contrôle');
  assert.doesNotMatch(apres503, /cleCourante = null/);
});

test('réservation : le refus pour réservation déjà active propose d’écrire quand c’est une autre personne à la même adresse', () => {
  assert.match(RESERVER_JS, /Vous réservez pour une autre personne avec la même adresse/);
  assert.match(RESERVER_JS, /avecContact\('Vous avez déjà un échange prévu/);
});

test('réservation : le champ e-mail déclare ses attributs de saisie (pas de majuscule automatique, pas de correcteur)', () => {
  const champ = lire('public/reserver/index.html').match(/<input[^>]*\bid="email"[^>]*>/i)?.[0] ?? '';
  // autocapitalize n'est pas autorisé sur un champ de type email (le validateur HTML le refuse) : les navigateurs n'y mettent déjà jamais de majuscule.
  for (const attribut of ['type="email"', 'autocomplete="email"', 'inputmode="email"', 'spellcheck="false"', 'maxlength="120"']) assert.ok(champ.includes(attribut), attribut);
  assert.doesNotMatch(champ, /autocapitalize/i);
});

test('confirmation : le bouton flottant ouvre un e-mail, et son icône est une enveloppe (pas le logo WhatsApp)', () => {
  const fab = CONFIRMATION.match(/<a class="fab"[^>]*>.*?<\/a>/is)?.[0] ?? '';
  assert.match(fab, /href="mailto:contact@horsfiltre\.fr"/i);
  assert.match(fab, /data-icone="courrier"/);
  // le tracé du logo WhatsApp : un bouton qui ne mène pas à WhatsApp ne doit pas en porter le logo
  assert.doesNotMatch(fab, /M12 2a10 10 0 0 0-8\.6 15\.1/);
  assert.match(fab, /Une question/);
});

test('confirmation : le bouton flottant s’écarte devant toutes les actions de la page, y compris « Ajouter à mon agenda » (.btn-ink)', () => {
  const hf = lire('public/assets/js/hf.js');
  const liste = hf.match(/d\.querySelectorAll\('([^']*\.sticky-bar[^']*)'\)\.forEach\(function \(b\) \{ io\.observe\(b\)/)?.[1] ?? '';
  assert.ok(liste.length > 0, 'la liste des éléments observés existe');
  // Chaque classe de bouton utilisée sur une page qui porte le bouton flottant doit y figurer.
  const classes = new Set([...CONFIRMATION.matchAll(/class="btn (btn-[a-z]+)/g)].map((m) => m[1]));
  for (const c of classes) assert.ok(liste.includes(`.${c}`), `.${c} manque dans la liste : le bouton flottant la recouvrirait`);
  assert.ok(classes.has('btn-ink'), 'la page porte bien un .btn-ink');
  // Le lien de correction est aussi une action : à 320 px de large, le bouton flottant le recouvrait.
  assert.ok(liste.includes('[data-mauvaise-adresse]'), 'le lien de correction manque dans la liste');
});

test('procédure d’équipe : l’adresse incorrecte a sa conduite à tenir, fidèle à ce que le produit sait faire', async () => {
  const { DELAI_MINIMUM_HEURES } = await import('../../shared/src/constantes.mts');
  const doc = lire('docs/operations/adresse-incorrecte.md');
  // Toutes les durées citées, pas seulement l'une d'elles : un document qui se contredit est pire qu'un document absent.
  const durees = [...doc.matchAll(/(\d+) heures/g)].map((m) => Number(m[1]));
  assert.ok(durees.length >= 2, 'le délai est cité aux endroits où il compte');
  assert.deepEqual([...new Set(durees)], [DELAI_MINIMUM_HEURES], 'chaque durée citée est celle du code');
  assert.match(doc, /## Conduite à tenir/);
  assert.match(doc, /## Cas particulier/);
  assert.match(doc, /ne sait ni corriger une adresse, ni créer une réservation/);
  assert.doesNotMatch(doc, /[\w.+-]+@(?!horsfiltre\.fr)[\w-]+\.[a-z]{2,}/i, 'aucune adresse de personne');
  // la page promet ce que la procédure tient : écrire avec la bonne adresse, recevoir les informations
  assert.match(CONFIRMATION, /avec la bonne adresse[\s\S]*nous vous renvoyons les informations de votre échange/i);
});
