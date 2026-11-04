import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32, inflateRawSync } from 'node:zlib';
import { creerZip } from '../../scripts/zip.mjs';

/** Lit une archive à un seul niveau : suffisant pour vérifier ce que `creerZip` écrit. */
function lireZip(zip: Buffer) {
  const fin = zip.length - 22;
  assert.equal(zip.readUInt32LE(fin), 0x06054b50, 'fin d’archive');
  const nombre = zip.readUInt16LE(fin + 10);
  let central = zip.readUInt32LE(fin + 16);
  const entrees: { nom: string; contenu: Buffer; mode: number; crcDeclare: number }[] = [];
  for (let i = 0; i < nombre; i++) {
    assert.equal(zip.readUInt32LE(central), 0x02014b50, 'répertoire central');
    const tailleNom = zip.readUInt16LE(central + 28);
    const decalageLocal = zip.readUInt32LE(central + 42);
    const mode = zip.readUInt32LE(central + 38) >>> 16;
    const crcDeclare = zip.readUInt32LE(central + 16);
    const nom = zip.subarray(central + 46, central + 46 + tailleNom).toString('utf8');
    assert.equal(zip.readUInt32LE(decalageLocal), 0x04034b50, 'en-tête local');
    const compresse = zip.readUInt32LE(decalageLocal + 18);
    const debut = decalageLocal + 30 + zip.readUInt16LE(decalageLocal + 26);
    entrees.push({ nom, contenu: inflateRawSync(zip.subarray(debut, debut + compresse)), mode, crcDeclare });
    central += 46 + tailleNom;
  }
  return entrees;
}

test('zip : les fichiers écrits se relisent à l’identique, avec leur somme de contrôle', () => {
  const a = Buffer.from("export const handler = async () => 'ok';\n".repeat(200));
  const b = Buffer.from('Élodie — accents et symboles ✓');
  const lus = lireZip(creerZip([{ nom: 'index.mjs', contenu: a }, { nom: 'donnée/é.txt', contenu: b }]));
  assert.deepEqual(lus.map((e) => e.nom), ['index.mjs', 'donnée/é.txt']);
  assert.ok(lus[0]!.contenu.equals(a));
  assert.ok(lus[1]!.contenu.equals(b));
  for (const e of lus) assert.equal(e.crcDeclare, crc32(e.contenu));
});

test('zip : l’archive est déterministe, et les fichiers sont lisibles (0644)', () => {
  const entrees = [{ nom: 'index.mjs', contenu: Buffer.from('console.log(1)') }];
  assert.ok(creerZip(entrees).equals(creerZip(entrees)));
  assert.equal(lireZip(creerZip(entrees))[0]!.mode, 0o100644);
});

test('zip : un contenu vide et un contenu qui ne se compresse pas sont acceptés', () => {
  const alea = Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 7919 + 13) % 251));
  const lus = lireZip(creerZip([{ nom: 'vide', contenu: Buffer.alloc(0) }, { nom: 'dense', contenu: alea }]));
  assert.equal(lus[0]!.contenu.length, 0);
  assert.ok(lus[1]!.contenu.equals(alea));
});
