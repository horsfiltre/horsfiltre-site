// La construction de l'interface d'administration pour un environnement : validation de sa configuration et fabrication de la
// politique de sécurité qui va avec. Fonctions pures, sans accès au disque : elles se testent sans rien écrire.
//
// Pourquoi ce module existe : la politique de sécurité de l'administration (admin/_headers) ne laisse sortir le navigateur que vers
// l'API et la page de connexion de SON environnement. Changer la configuration sans changer cette politique la rend inutilisable ;
// la changer à la main, c'est un oubli en attente. Ici, elle est fabriquée à partir de la configuration.

import { sep } from 'node:path';

export const ENVIRONNEMENTS = ['production', 'preprod'];

/** Un chemin avec des barres obliques, quel que soit le système : les messages et les comparaisons ne dépendent pas de Windows. */
export const versPosix = (chemin, separateur = sep) => chemin.split(separateur).join('/');

const CLES = ['api', 'cognito', 'clientId', 'emailsActifs'];
// Une origine, et rien d'autre : pas de chemin, pas de barre finale, pas de port. C'est ce que la politique de sécurité attend.
const ORIGINE_HTTPS = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
const IDENTIFIANT_CLIENT = /^[a-z0-9]{20,32}$/;
const PAGE_DE_CONNEXION = /\.auth\.[a-z0-9-]+\.amazoncognito\.com$/i;

/** Valide une configuration d'administration. Lève une erreur qui dit exactement quoi corriger. */
export function validerConfiguration(config, environnement) {
  if (!ENVIRONNEMENTS.includes(environnement)) throw new Error(`Environnement inconnu : « ${environnement} » (attendu : ${ENVIRONNEMENTS.join(' ou ')}).`);
  if (typeof config !== 'object' || config === null || Array.isArray(config)) throw new Error('La configuration doit être un objet.');

  const manquantes = CLES.filter((k) => !(k in config));
  if (manquantes.length) throw new Error(`Configuration incomplète, clé(s) manquante(s) : ${manquantes.join(', ')}.`);
  const inconnues = Object.keys(config).filter((k) => !CLES.includes(k));
  if (inconnues.length) throw new Error(`Clé(s) inconnue(s) : ${inconnues.join(', ')} (une faute de frappe, probablement).`);

  for (const cle of ['api', 'cognito']) {
    if (typeof config[cle] !== 'string' || !ORIGINE_HTTPS.test(config[cle])) {
      throw new Error(`« ${cle} » doit être une origine https sans chemin ni barre finale, par exemple https://exemple.fr (reçu : ${JSON.stringify(config[cle])}).`);
    }
  }
  if (!PAGE_DE_CONNEXION.test(new URL(config.cognito).hostname)) throw new Error(`« cognito » doit être une page de connexion Cognito (…auth.<région>.amazoncognito.com).`);
  if (typeof config.clientId !== 'string' || !IDENTIFIANT_CLIENT.test(config.clientId)) throw new Error('« clientId » doit être un identifiant de client Cognito (20 à 32 caractères, minuscules et chiffres).');
  if (typeof config.emailsActifs !== 'boolean') throw new Error('« emailsActifs » doit être true ou false.');

  if (environnement === 'production') {
    const hoteApi = new URL(config.api).hostname;
    if (!hoteApi.endsWith('.horsfiltre.fr')) throw new Error(`En production, l'API doit être sur un nom de domaine de horsfiltre.fr (reçu : ${hoteApi}).`);
    if (hoteApi.includes('execute-api')) throw new Error("En production, l'API ne doit pas être appelée par l'adresse d'API Gateway : elle est fermée.");
    if (/preprod/i.test(config.cognito) || /preprod/i.test(config.api)) throw new Error("En production, aucune adresse de préproduction.");
  }
  return config;
}

/** La politique de sécurité de l'administration. Seuls l'API et la page de connexion de l'environnement peuvent être contactées. */
export function politiqueSecurite(config) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${config.api} ${config.cognito}`,
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Remplace la ligne de politique d'un fichier _headers, et seulement elle. Les autres en-têtes restent ceux du fichier. */
export function remplacerPolitique(texteEntetes, config) {
  const lignes = texteEntetes.split('\n');
  const indices = lignes.flatMap((l, i) => (/^\s+Content-Security-Policy:/.test(l) ? [i] : []));
  if (indices.length !== 1) throw new Error(`Le fichier d'en-têtes doit contenir exactement une ligne Content-Security-Policy (trouvé : ${indices.length}).`);
  lignes[indices[0]] = `  Content-Security-Policy: ${politiqueSecurite(config)}`;
  return lignes.join('\n');
}

/** Ce que la production ne doit jamais contenir, où que ce soit dans l'interface construite. */
export const INTERDITS_EN_PRODUCTION = ['localhost', '127.0.0.1', 'preprod', 'execute-api', 'pf1k43c6r3'];

/**
 * Cherche ces mots dans le contenu de l'interface construite. `contenus` : [{ chemin, texte }]. Rend chaque trouvaille, avec un
 * chemin en barres obliques : le message est le même sous Windows et sous Linux. `separateur` ne sert qu'aux essais.
 */
export function interditsTrouves(contenus, separateur = sep) {
  return contenus.flatMap(({ chemin, texte }) => INTERDITS_EN_PRODUCTION.filter((mot) => texte.includes(mot)).map((interdit) => ({ chemin: versPosix(chemin, separateur), interdit })));
}
