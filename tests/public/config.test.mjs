import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choisirConfiguration, PREPROD } from '../../public/assets/js/config.js';
import { dateParisIso } from '../../public/assets/js/temps.js';

test('configuration : horsfiltre.fr est fermé tant que la production n’existe pas, jamais en démonstration', () => {
  for (const hote of ['horsfiltre.fr', 'www.horsfiltre.fr', 'HORSFILTRE.FR', 'horsfiltre.pages.dev']) {
    const c = choisirConfiguration(hote, '?demo=1&api=http://localhost:9102');
    assert.equal(c.mode, 'ferme', hote);
    assert.equal(c.api, '', hote);
  }
});

test('configuration : un aperçu de Cloudflare Pages parle à la préproduction', () => {
  for (const hote of ['lot-8-reservation-publique.horsfiltre.pages.dev', '72f40ec8.horsfiltre.pages.dev', 'a.horsfiltre.pages.dev']) {
    assert.deepEqual(choisirConfiguration(hote), { mode: 'reel', api: PREPROD.api, turnstile: PREPROD.turnstile }, hote);
  }
});

test('configuration : les imitations d’adresse ne reçoivent rien', () => {
  for (const hote of ['horsfiltre.pages.dev.evil.com', 'evilhorsfiltre.pages.dev', 'a.b.horsfiltre.pages.dev', '-a.horsfiltre.pages.dev', 'horsfiltre.fr.evil.com', 'xhorsfiltre.fr', '', undefined]) {
    assert.equal(choisirConfiguration(hote).mode, 'ferme', String(hote));
  }
});

test('configuration : la démonstration n’existe que sur le poste d’un développeur', () => {
  assert.equal(choisirConfiguration('localhost').mode, 'demo');
  assert.equal(choisirConfiguration('127.0.0.1').mode, 'demo');
  for (const hote of ['horsfiltre.fr', 'exemple.fr', 'lot-8.horsfiltre.pages.dev', '192.168.1.10', 'localhost.evil.com']) {
    assert.notEqual(choisirConfiguration(hote, '?demo=1').mode, 'demo', hote);
  }
});

test('configuration : sur le poste, une API locale d’essai est acceptée, et seulement une API locale', () => {
  assert.deepEqual(choisirConfiguration('localhost', '?api=http://localhost:9102&turnstile=essai'), { mode: 'reel', api: 'http://localhost:9102', turnstile: 'essai' });
  for (const api of ['https://evil.example', 'http://localhost', 'http://localhost:9102/chemin', 'javascript:alert(1)', 'http://localhost:9102@evil.example']) {
    assert.equal(choisirConfiguration('localhost', `?api=${encodeURIComponent(api)}`).mode, 'demo', api);
  }
});

test('dates : le jour envoyé à l’API est celui de Paris, au format du contrat', () => {
  assert.equal(dateParisIso(new Date('2026-11-04T23:30:00Z')), '2026-11-05'); // déjà le 5 à Paris (hiver)
  assert.equal(dateParisIso(new Date('2026-07-01T21:59:00Z')), '2026-07-01'); // 23 h 59 à Paris (été)
  assert.equal(dateParisIso(new Date('2026-07-01T22:00:00Z')), '2026-07-02');
  assert.match(dateParisIso(new Date()), /^\d{4}-\d{2}-\d{2}$/);
});
