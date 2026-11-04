// Écrit une archive ZIP, sans dépendance. Déterministe : mêmes fichiers, mêmes octets (dates fixées au 1er janvier 1980),
// ce qui évite qu'un redéploiement paraisse nécessaire alors que le code n'a pas changé.
import { crc32, deflateRawSync } from 'node:zlib';

const DATE_DOS = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const HEURE_DOS = 0;
const MODE_FICHIER = (0o100644 << 16) >>> 0; // -rw-r--r-- : Lambda doit pouvoir lire chaque fichier

export function creerZip(entrees) {
  const locaux = [];
  const centraux = [];
  let decalage = 0;
  for (const { nom, contenu } of entrees) {
    const nomOctets = Buffer.from(nom, 'utf8');
    const compresse = deflateRawSync(contenu, { level: 9 });
    const crc = crc32(contenu);

    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0);
    entete.writeUInt16LE(20, 4);        // version nécessaire
    entete.writeUInt16LE(0x0800, 6);    // noms en UTF-8
    entete.writeUInt16LE(8, 8);         // méthode : deflate
    entete.writeUInt16LE(HEURE_DOS, 10);
    entete.writeUInt16LE(DATE_DOS, 12);
    entete.writeUInt32LE(crc, 14);
    entete.writeUInt32LE(compresse.length, 18);
    entete.writeUInt32LE(contenu.length, 22);
    entete.writeUInt16LE(nomOctets.length, 26);
    locaux.push(entete, nomOctets, compresse);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // créée sous Unix : les permissions sont lues
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(HEURE_DOS, 12);
    central.writeUInt16LE(DATE_DOS, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compresse.length, 20);
    central.writeUInt32LE(contenu.length, 24);
    central.writeUInt16LE(nomOctets.length, 28);
    central.writeUInt32LE(MODE_FICHIER, 38);
    central.writeUInt32LE(decalage, 42);
    centraux.push(central, nomOctets);

    decalage += entete.length + nomOctets.length + compresse.length;
  }
  const tailleCentral = centraux.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...centraux, fin]);
}
