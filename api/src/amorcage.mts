// Lecture du fichier d'amorçage des accompagnants. Le fichier reste sur le poste de l'administrateur
// (docs/sources/, ignoré par Git) : les liens de visioconférence n'entrent jamais dans le dépôt.
//
// Une ligne par accompagnant :   identifiant : Prénom : https://meet.google.com/xxx-xxxx-xxx
// Les lignes vides et celles qui commencent par # sont ignorées.
import type { Accompagnant } from '../../shared/src/index.mts';

const FORMAT_IDENTIFIANT = /^[a-z][a-z0-9-]{1,19}$/;
// Lettres de toutes les langues, accents, espace, trait d'union, apostrophe, point.
const FORMAT_PRENOM = /^[\p{L}\p{M}][\p{L}\p{M}' ’.-]{0,59}$/u;
const FORMAT_LIEN_MEET = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
// Le troisième champ est lu tel quel : c'est le contrôle du lien qui dit précisément ce qui ne va pas.
const FORMAT_LIGNE = /^\s*([^:]+?)\s*:\s*([^:]+?)\s*:\s*(\S+)\s*$/;

export type ResultatLecture = { accompagnants: Accompagnant[]; erreurs: string[] };

export function lireAccompagnants(texte: string): ResultatLecture {
  const accompagnants: Accompagnant[] = [];
  const erreurs: string[] = [];
  const vus = new Set<string>();

  texte.split(/\r?\n/).forEach((ligne, i) => {
    const numero = i + 1;
    if (!ligne.trim() || ligne.trim().startsWith('#')) return;
    const m = FORMAT_LIGNE.exec(ligne);
    if (!m) {
      erreurs.push(`ligne ${numero} : le format attendu est « identifiant : Prénom : https://meet.google.com/xxx-xxxx-xxx ».`);
      return;
    }
    const [, id, prenom, lienVisio] = m as unknown as [string, string, string, string];
    const avant = erreurs.length;
    if (!FORMAT_IDENTIFIANT.test(id)) erreurs.push(`ligne ${numero} : identifiant « ${id} » invalide (minuscules sans accent, chiffres et tirets, de 2 à 20 caractères, commence par une lettre).`);
    if (!FORMAT_PRENOM.test(prenom)) erreurs.push(`ligne ${numero} : prénom invalide (lettres, espace, trait d'union, apostrophe ; 60 caractères au plus).`);
    if (!FORMAT_LIEN_MEET.test(lienVisio)) erreurs.push(`ligne ${numero} : le lien doit être de la forme https://meet.google.com/xxx-xxxx-xxx (minuscules).`);
    if (vus.has(id)) erreurs.push(`ligne ${numero} : l'identifiant « ${id} » apparaît deux fois.`);
    vus.add(id);
    if (erreurs.length === avant) accompagnants.push({ id, prenom, lienVisio, actif: true });
  });

  if (accompagnants.length === 0 && erreurs.length === 0) erreurs.push('le fichier ne contient aucun accompagnant.');
  return { accompagnants, erreurs };
}

/** Pour l'affichage : le lien ne s'imprime jamais en entier dans un terminal ni dans un journal. */
export function masquerLien(lien: string): string {
  return lien.replace(/(meet\.google\.com\/[a-z]{3})-[a-z]{4}-[a-z]{3}$/, '$1-****-***');
}
