// Envoi des e-mails : un message MIME construit à la main (une pièce jointe de calendrier exige le format brut de SES),
// sans dépendance. La construction est pure et testable ; seul `creerEnvoyeurSes` parle au réseau.
import { randomBytes } from 'node:crypto';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';

export type Envoi = {
  a: string;
  sujet: string;
  texte: string;
  html: string;
  /** Pièce jointe de calendrier : `methode` doit être celle écrite dans le fichier. */
  ics?: { contenu: string; methode: 'PUBLISH' | 'CANCEL' };
};
export type Envoyeur = (envoi: Envoi) => Promise<void>;

const CRLF = '\r\n';

/** Refuse tout retour à la ligne dans un en-tête : c'est ainsi qu'on injecte un en-tête ou un destinataire de plus. */
function enteteSur(valeur: string, nom: string): string {
  if (/[\r\n]/.test(valeur)) throw new Error(`Retour à la ligne interdit dans l'en-tête ${nom}`);
  return valeur;
}

/** Sujet encodé en mots RFC 2047 (UTF-8, base64), découpé sans jamais couper un caractère multi-octets. */
export function encoderSujet(sujet: string): string {
  const s = enteteSur(sujet, 'Subject');
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const mots: string[] = [];
  let courant = '';
  for (const caractere of s) {
    if (Buffer.byteLength(courant + caractere, 'utf8') > 42) { mots.push(courant); courant = ''; }
    courant += caractere;
  }
  if (courant) mots.push(courant);
  return mots.map((m) => `=?UTF-8?B?${Buffer.from(m, 'utf8').toString('base64')}?=`).join(CRLF + ' ');
}

/** Base64 en lignes de 76 caractères, comme l'exige la norme. */
const base64Lignes = (texte: string): string => (Buffer.from(texte, 'utf8').toString('base64').match(/.{1,76}/g) ?? ['']).join(CRLF);

export function construireMime(p: { de: string; nomExpediteur: string; envoi: Envoi; date: Date; frontiere?: () => string }): string {
  const { de, nomExpediteur, envoi, date } = p;
  const frontiere = p.frontiere ?? (() => `hf_${randomBytes(12).toString('hex')}`);
  const alt = frontiere();
  const entetes = [
    `From: ${encoderSujet(nomExpediteur)} <${enteteSur(de, 'From')}>`,
    `To: ${enteteSur(envoi.a, 'To')}`,
    `Subject: ${encoderSujet(envoi.sujet)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
  ];
  const partieTexte = [`--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lignes(envoi.texte)];
  const partieHtml = [`--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64Lignes(envoi.html)];
  const alternative = [...partieTexte, ...partieHtml, `--${alt}--`].join(CRLF);

  if (!envoi.ics) {
    return [...entetes, `Content-Type: multipart/alternative; boundary="${alt}"`, '', alternative, ''].join(CRLF);
  }
  const mixte = frontiere();
  const piece = [
    `--${mixte}`,
    `Content-Type: text/calendar; charset=UTF-8; method=${envoi.ics.methode}; name="echange-hors-filtre.ics"`,
    'Content-Disposition: attachment; filename="echange-hors-filtre.ics"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lignes(envoi.ics.contenu),
  ].join(CRLF);
  const enveloppe = [`--${mixte}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '', alternative].join(CRLF);
  return [...entetes, `Content-Type: multipart/mixed; boundary="${mixte}"`, '', enveloppe, piece, `--${mixte}--`, ''].join(CRLF);
}

export type ClientSes = { send: (commande: SendEmailCommand) => Promise<unknown> };

/** L'envoi réel, par l'API v2 de SES, avec l'ensemble de configuration (événements de rebond et de plainte). */
export function creerEnvoyeurSes(client: ClientSes, config: { expediteur: string; ensemble: string; nomExpediteur?: string; maintenant?: () => Date }): Envoyeur {
  return async (envoi) => {
    const mime = construireMime({ de: config.expediteur, nomExpediteur: config.nomExpediteur ?? 'Hors Filtre', envoi, date: (config.maintenant ?? (() => new Date()))() });
    await client.send(new SendEmailCommand({
      FromEmailAddress: config.expediteur,
      Destination: { ToAddresses: [envoi.a] },
      Content: { Raw: { Data: Buffer.from(mime, 'utf8') } },
      ConfigurationSetName: config.ensemble,
    }));
  };
}
