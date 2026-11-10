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
