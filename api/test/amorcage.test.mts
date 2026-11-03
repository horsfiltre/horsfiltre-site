import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireAccompagnants, masquerLien } from '../src/amorcage.mts';

const lien = 'https://meet.google.com/abc-defg-hij';

test('amorçage : des lignes valides donnent des accompagnants actifs', () => {
  const r = lireAccompagnants(`ilyas : Ilyas : ${lien}\nsarah-m : Sarah-Anne : https://meet.google.com/xyz-wxyz-wxy\n`);
  assert.deepEqual(r.erreurs, []);
  assert.deepEqual(r.accompagnants, [
    { id: 'ilyas', prenom: 'Ilyas', lienVisio: lien, actif: true },
    { id: 'sarah-m', prenom: 'Sarah-Anne', lienVisio: 'https://meet.google.com/xyz-wxyz-wxy', actif: true },
  ]);
});

test('amorçage : les lignes vides, les commentaires, les espaces et les fins de ligne Windows sont tolérés', () => {
  const r = lireAccompagnants(`# les associés\r\n\r\n  ilyas   :   Ilyas   :   ${lien}  \r\n   # un commentaire\r\n`);
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.accompagnants.length, 1);
  assert.equal(r.accompagnants[0]!.prenom, 'Ilyas');
});

test('amorçage : un prénom avec accent ou apostrophe est accepté', () => {
  const r = lireAccompagnants(`elodie : Élodie : ${lien}\ndart : D’Artagnan : https://meet.google.com/xyz-wxyz-wxy`);
  assert.deepEqual(r.erreurs, []);
});

test('amorçage : chaque erreur est signalée avec son numéro de ligne et son motif, et la ligne fautive n’est pas retenue', () => {
  const cas: [string, RegExp][] = [
    [`Ilyas : Ilyas : ${lien}`, /identifiant « Ilyas » invalide/],                          // identifiant en majuscule
    [`a : Ilyas : ${lien}`, /identifiant « a » invalide/],                                  // identifiant trop court
    [`ily-3 : Ily@s : ${lien}`, /prénom invalide/],                                          // prénom invalide
    ['ily-4 : Ilyas : https://meet.google.com/abc', /le lien doit être/],                    // lien incomplet
    ['ily-5 : Ilyas : https://zoom.us/j/123456', /le lien doit être/],                       // pas Google Meet
    ['ily-6 : Ilyas : http://meet.google.com/abc-defg-hij', /le lien doit être/],            // pas en https
    [`ily-7 : Ilyas : ${lien.toUpperCase()}`, /le lien doit être/],                          // majuscules
    ['ily-8 : Ilyas : https://evil.example/abc-defg-hij', /le lien doit être/],              // bonne forme, mauvais domaine
    ['ily-9 : Ilyas : https://meet.google.com.evil.example/abc-defg-hij', /le lien doit être/], // imitation du domaine
    ['ily-10 : Ilyas : https://meet.google.com/abc-defg-hij/extra', /le lien doit être/],    // chemin en trop
    ['pas de séparateurs', /le format attendu est/],
  ];
  const r = lireAccompagnants(cas.map(([ligne]) => ligne).join('\n'));
  assert.equal(r.accompagnants.length, 0);
  assert.equal(r.erreurs.length, cas.length);
  for (const [i, [, motif]] of cas.entries()) {
    assert.ok(r.erreurs[i]!.startsWith(`ligne ${i + 1} :`), r.erreurs[i]);
    assert.match(r.erreurs[i]!, motif);
  }
});

test('amorçage : un identifiant en double est refusé, et la seconde ligne n’est pas retenue', () => {
  const r = lireAccompagnants(`ilyas : Ilyas : ${lien}\nilyas : Autre : https://meet.google.com/xyz-wxyz-wxy`);
  assert.equal(r.accompagnants.length, 1);
  assert.match(r.erreurs[0]!, /ligne 2 .* deux fois/);
});

test('amorçage : un fichier vide, ou sans accompagnant, est une erreur', () => {
  assert.deepEqual(lireAccompagnants('').erreurs, ['le fichier ne contient aucun accompagnant.']);
  assert.deepEqual(lireAccompagnants('# rien\n\n').erreurs, ['le fichier ne contient aucun accompagnant.']);
});

test('amorçage : le lien s’affiche toujours masqué', () => {
  assert.equal(masquerLien(lien), 'https://meet.google.com/abc-****-***');
  assert.doesNotMatch(masquerLien(lien), /defg|hij/);
});
