// Contenu des e-mails et du fichier de calendrier joint. Fonctions pures : aucun réseau, aucune horloge système
// (tout instant est donné en paramètre). Testables sans aucun simulacre.
import type { Reservation } from './stockage.mts';

const FUSEAU = 'Europe/Paris';
const SITE = 'https://horsfiltre.fr';

const FMT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const FMT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const libelleJour = (iso: string) => FMT_JOUR.format(new Date(iso));
const libelleHeure = (iso: string) => FMT_HEURE.format(new Date(iso));

/** Échappe une valeur pour l'insérer sans risque dans du HTML (prénom, motivation, etc. viennent d'un candidat). */
function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type ContenuAccompagnant = { prenom: string; lienVisio: string };
export type LiensGestion = { consulter: string; annuler: string; reporter: string };

export type Message = { sujet: string; texte: string; html: string };

const pied = (r: Reservation) =>
  `\n---\nHors Filtre, ${SITE}, contact@horsfiltre.fr\nVous recevez ce message parce que vous avez réservé un échange sur horsfiltre.fr avec l'adresse ${r.email}. Vous ne recevrez que les messages liés à cette réservation.`;

const piedHtml = () =>
  `<p style="color:#5F6480;font-size:12px;margin-top:24px;border-top:1px solid #E3E4EC;padding-top:12px">Hors Filtre, <a href="${SITE}">${SITE.replace('https://', '')}</a>, contact@horsfiltre.fr<br>Vous recevez ce message parce que vous avez réservé un échange sur horsfiltre.fr. Vous ne recevrez que les messages liés à cette réservation.</p>`;

function gabarit(titre: string, corpsHtml: string): string {
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#121530;max-width:560px;margin:0 auto;padding:24px 16px">
<p style="font-weight:700;font-size:18px;margin-bottom:16px">${echapper(titre)}</p>
${corpsHtml}
${piedHtml()}
</body></html>`;
}

// ------------------------------------------------------------------------------------------------ confirmation

export function messageConfirmation(r: Reservation, accompagnant: ContenuAccompagnant, liens: LiensGestion): Message {
  const quand = `${libelleJour(r.debut)}, de ${libelleHeure(r.debut)} à ${libelleHeure(r.fin)} (heure de Paris)`;
  const comment = r.canal === 'whatsapp' ? `par WhatsApp, au numéro ${r.whatsapp}` : `en visio, avec ce lien : ${accompagnant.lienVisio}`;
  const sujet = `Votre échange avec Hors Filtre : ${libelleJour(r.debut).split(' ').slice(0, 3).join(' ')}, ${libelleHeure(r.debut)}`;
  const texte = `Bonjour ${r.prenom},

Votre échange gratuit de 30 minutes est réservé.

Quand : ${quand}
Comment : ${comment}
Avec : ${accompagnant.prenom}

Un empêchement ? Vous pouvez annuler ou choisir un autre créneau jusqu'au début de l'échange, avec ce lien : ${liens.consulter}

Vous pouvez répondre à ce message : il arrive directement à l'équipe.${pied(r)}`;
  const html = gabarit('Votre échange gratuit de 30 minutes est réservé.', `
<p>Bonjour ${echapper(r.prenom)},</p>
<p><strong>Quand :</strong> ${echapper(quand)}<br>
<strong>Comment :</strong> ${r.canal === 'whatsapp' ? echapper(comment) : `en visio, avec <a href="${echapper(accompagnant.lienVisio)}">ce lien</a>`}<br>
<strong>Avec :</strong> ${echapper(accompagnant.prenom)}</p>
<p>Un empêchement ? Vous pouvez <a href="${echapper(liens.consulter)}">annuler ou choisir un autre créneau</a> jusqu'au début de l'échange.</p>
<p>Vous pouvez répondre à ce message : il arrive directement à l'équipe.</p>`);
  return { sujet, texte, html };
}

// ------------------------------------------------------------------------------------------------ rappels

export function messageRappel(r: Reservation, accompagnant: ContenuAccompagnant, liens: LiensGestion, type: 'veille' | 'heure'): Message {
  const comment = r.canal === 'whatsapp' ? `par WhatsApp, au numéro ${r.whatsapp}` : `en visio, avec ce lien : ${accompagnant.lienVisio}`;
  const quand = type === 'veille' ? `demain à ${libelleHeure(r.debut)}` : `dans une heure, à ${libelleHeure(r.debut)}`;
  const sujet = type === 'veille' ? `Rappel : votre échange Hors Filtre demain à ${libelleHeure(r.debut)}` : `Rappel : votre échange Hors Filtre dans une heure`;
  const texte = `Bonjour ${r.prenom},

Petit rappel : votre échange avec ${accompagnant.prenom} a lieu ${quand} (heure de Paris), ${comment}.

Un empêchement ? Vous pouvez annuler ou reporter jusqu'au début de l'échange, avec ce lien : ${liens.consulter}${pied(r)}`;
  const html = gabarit(`Votre échange avec Hors Filtre a lieu ${type === 'veille' ? 'demain' : 'dans une heure'}.`, `
<p>Bonjour ${echapper(r.prenom)},</p>
<p>Petit rappel : votre échange avec ${echapper(accompagnant.prenom)} a lieu ${echapper(quand)} (heure de Paris), ${r.canal === 'whatsapp' ? echapper(comment) : `en visio, avec <a href="${echapper(accompagnant.lienVisio)}">ce lien</a>`}.</p>
<p>Un empêchement ? Vous pouvez <a href="${echapper(liens.consulter)}">annuler ou reporter</a> jusqu'au début de l'échange.</p>`);
  return { sujet, texte, html };
}

// ------------------------------------------------------------------------------------------------ report

export function messageReport(r: Reservation, accompagnant: ContenuAccompagnant, liens: LiensGestion, ancienDebut: string): Message {
  const quand = `${libelleJour(r.debut)}, de ${libelleHeure(r.debut)} à ${libelleHeure(r.fin)} (heure de Paris)`;
  const avant = `${libelleJour(ancienDebut)} à ${libelleHeure(ancienDebut)}`;
  const comment = r.canal === 'whatsapp' ? `par WhatsApp, au numéro ${r.whatsapp}` : `en visio, avec ce lien : ${accompagnant.lienVisio}`;
  const sujet = `Votre échange Hors Filtre est déplacé : ${libelleJour(r.debut).split(' ').slice(0, 3).join(' ')}, ${libelleHeure(r.debut)}`;
  const texte = `Bonjour ${r.prenom},

Votre échange est déplacé. L'ancien créneau (${avant}) est annulé.

Nouveau créneau : ${quand}
Comment : ${comment}
Avec : ${accompagnant.prenom}

Votre nouveau lien pour annuler ou déplacer encore, valable jusqu'au début de l'échange : ${liens.consulter}
Le lien de votre précédent message ne fonctionnera bientôt plus : utilisez celui-ci.${pied(r)}`;
  const html = gabarit('Votre échange est déplacé.', `
<p>Bonjour ${echapper(r.prenom)},</p>
<p>L'ancien créneau (${echapper(avant)}) est annulé.</p>
<p><strong>Nouveau créneau :</strong> ${echapper(quand)}<br>
<strong>Comment :</strong> ${r.canal === 'whatsapp' ? echapper(comment) : `en visio, avec <a href="${echapper(accompagnant.lienVisio)}">ce lien</a>`}<br>
<strong>Avec :</strong> ${echapper(accompagnant.prenom)}</p>
<p>Votre <a href="${echapper(liens.consulter)}">nouveau lien</a> pour annuler ou déplacer encore. Le lien de votre précédent message ne fonctionnera bientôt plus.</p>`);
  return { sujet, texte, html };
}

// ------------------------------------------------------------------------------------------------ annulation

export function messageAnnulation(r: Reservation, parAdministrateur: boolean, messageEquipe?: string): Message {
  const quand = `${libelleJour(r.debut)} à ${libelleHeure(r.debut)}`;
  const sujet = `Votre échange Hors Filtre du ${libelleJour(r.debut).split(' ').slice(0, 3).join(' ')} est annulé`;
  const motif = parAdministrateur
    ? `L'équipe a dû annuler votre échange du ${quand}.${messageEquipe ? `\n\n« ${messageEquipe} »` : ''}\n\nVous pouvez réserver un nouveau créneau quand vous le souhaitez : ${SITE}/reserver/`
    : `Votre échange du ${quand} est bien annulé, comme vous l'avez demandé.`;
  const texte = `Bonjour ${r.prenom},\n\n${motif}${pied(r)}`;
  const html = gabarit(sujet, `<p>Bonjour ${echapper(r.prenom)},</p><p>${echapper(motif).replace(/\n/g, '<br>')}</p>`);
  return { sujet, texte, html };
}

// ------------------------------------------------------------------------------------------------ copie interne

export function messageCopieInterne(r: Reservation, accompagnant: ContenuAccompagnant, evenement: 'reservation' | 'annulation' | 'report' = 'reservation', ancienDebut?: string): Message {
  const etiquette = evenement === 'annulation' ? 'Annulation' : evenement === 'report' ? `Report${ancienDebut ? ` (ancien créneau : ${libelleJour(ancienDebut)} ${libelleHeure(ancienDebut)})` : ''}` : 'Nouvelle réservation';
  const sujet = `${etiquette} : ${r.prenom}, ${libelleJour(r.debut)} ${libelleHeure(r.debut)}`;
  const coord = r.canal === 'whatsapp' ? `WhatsApp : ${r.whatsapp}` : `Visio : ${accompagnant.lienVisio}`;
  const texte = `${r.prenom} <${r.email}>\n${libelleJour(r.debut)}, ${libelleHeure(r.debut)} – ${libelleHeure(r.fin)}\nAvec : ${accompagnant.prenom}\n${coord}\nRecherche : ${r.recherche}\n${r.motivation ? `\nMotivation :\n${r.motivation}\n` : ''}`;
  const html = gabarit(sujet, `<p>${echapper(r.prenom)} &lt;${echapper(r.email)}&gt;<br>${echapper(libelleJour(r.debut))}, ${echapper(libelleHeure(r.debut))} – ${echapper(libelleHeure(r.fin))}<br>Avec : ${echapper(accompagnant.prenom)}<br>${echapper(coord)}<br>Recherche : ${echapper(r.recherche)}</p>${r.motivation ? `<p><strong>Motivation :</strong><br>${echapper(r.motivation).replace(/\n/g, '<br>')}</p>` : ''}`);
  return { sujet, texte, html };
}

// ------------------------------------------------------------------------------------------------ calendrier (ICS)

/** Échappe un texte pour un champ ICS (RFC 5545) : antislash, point-virgule, virgule, puis les retours à la ligne. */
function echapperIcs(texte: string): string {
  return texte.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
const dateIcsUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Un fichier .ics minimal (une occurrence), avec repliement des lignes à 75 octets comme l'exige la norme. */
export function fichierIcs(r: Reservation, accompagnant: ContenuAccompagnant, genereLe: Date, options: { methode?: 'PUBLISH' | 'CANCEL'; sequence?: number } = {}): string {
  const methode = options.methode ?? 'PUBLISH';
  const lieu = r.canal === 'whatsapp' ? `WhatsApp ${r.whatsapp}` : accompagnant.lienVisio;
  const lignes = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hors Filtre//Reservation//FR', 'CALSCALE:GREGORIAN', `METHOD:${methode}`,
    'BEGIN:VEVENT',
    `UID:${r.id}@horsfiltre.fr`,
    `SEQUENCE:${options.sequence ?? 0}`,
    'ORGANIZER;CN=Hors Filtre:mailto:contact@horsfiltre.fr',
    `DTSTAMP:${dateIcsUtc(genereLe.toISOString())}`,
    `DTSTART:${dateIcsUtc(r.debut)}`,
    `DTEND:${dateIcsUtc(r.fin)}`,
    `SUMMARY:${echapperIcs(`Échange Hors Filtre avec ${accompagnant.prenom}`)}`,
    `LOCATION:${echapperIcs(lieu)}`,
    `DESCRIPTION:${echapperIcs(`Échange gratuit de 30 minutes avec ${accompagnant.prenom}, ${accompagnant.lienVisio}`)}`,
    `STATUS:${methode === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR',
  ];
  return lignes.flatMap(replier).join('\r\n') + '\r\n';
}

/** Replie une ligne ICS à 75 octets UTF-8 (RFC 5545 §3.1), sans jamais couper un caractère multi-octets en deux. */
function replier(ligne: string): string[] {
  const octets = Buffer.from(ligne, 'utf8');
  if (octets.length <= 75) return [ligne];
  const morceaux: string[] = [];
  let debut = 0;
  let limite = 75;
  while (debut < octets.length) {
    let fin = Math.min(debut + limite, octets.length);
    // Un octet de continuation UTF-8 s'écrit 10xxxxxx : reculer la coupure pour rester sur une frontière de caractère.
    while (fin < octets.length && (octets[fin]! & 0b1100_0000) === 0b1000_0000) fin--;
    morceaux.push(octets.subarray(debut, fin).toString('utf8'));
    debut = fin;
    limite = 74; // chaque ligne de continuation commence par un espace, qui compte dans les 75 octets
  }
  return morceaux.map((m, i) => (i === 0 ? m : ' ' + m));
}