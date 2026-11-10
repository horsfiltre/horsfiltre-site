// Échange réservé : la place se remplit, l'agenda s'ajoute, l'échange se prépare.
import { fichierAgenda, lienGoogleAgenda, heure, heureLocale, jour, majuscule } from './temps.js';
import { DEMO } from './api.js';

const d = document, $ = (s) => d.querySelector(s);
let r = null;
try { r = JSON.parse(sessionStorage.getItem('hf:reservation') || 'null'); } catch { /* */ }
const bloc = $('[data-confirmation]'), vide = $('[data-sans-reservation]');
if (!r) { bloc.hidden = true; vide.hidden = false; }
else {
  const debut = new Date(r.debut), fin = new Date(r.fin), loc = heureLocale(debut), qui = r.accompagnant?.prenom || 'votre accompagnant';
  $('[data-quand]').textContent = `${majuscule(jour(debut))}, ${heure(debut)} à ${heure(fin)}`;
  $('[data-local]').textContent = loc ? `Heure de Paris. Chez vous : ${loc.replace(' chez vous', '')}.` : 'Heure de Paris.';
  $('[data-qui]').textContent = qui;
  $('[data-comment]').textContent = r.canal === 'whatsapp'
    ? `Sur WhatsApp : ${qui} vous appellera au numéro que vous avez indiqué.`
    : `En visio : le lien Google Meet de ${qui} est dans votre e-mail de confirmation.`;
  $('[data-email]').textContent = r.email || 'votre adresse';
  // Une adresse fausse : la personne n'a ni le lien d'annulation ni le lien de visio. Son message à l'équipe porte l'identifiant de sa réservation.
  const correction = $('[data-mauvaise-adresse]');
  if (correction) correction.href = 'mailto:contact@horsfiltre.fr?subject=' + encodeURIComponent('Adresse e-mail incorrecte pour ma réservation')
    + '&body=' + encodeURIComponent(`Bonjour,\n\nl’adresse e-mail de ma réservation est incorrecte.\n\nRéservation : ${r.id}\nPrénom : ${r.prenomCandidat || ''}\nÉchange : ${$('[data-quand]').textContent}\nAvec : ${r.accompagnant?.prenom || ''}\nMa bonne adresse : \n`);
  const titre = `Échange Hors Filtre avec ${qui}`;
  const description = r.canal === 'whatsapp' ? `${qui} vous appellera sur WhatsApp. Pour annuler ou reporter : le lien de votre e-mail de confirmation.` : `Le lien Google Meet est dans votre e-mail de confirmation. Pour annuler ou reporter : le lien du même e-mail.`;
  const ics = $('[data-ics]');
  ics.href = URL.createObjectURL(fichierAgenda({ id: r.id, debut, fin, titre, description }));
  ics.download = 'echange-hors-filtre.ics';
  $('[data-google]').href = lienGoogleAgenda({ debut, fin, titre, description });
  if (DEMO && r.jetonDemo) { const g = $('[data-gerer-demo]'); g.hidden = false; g.querySelector('a').href = `/reserver/gerer/#${r.jetonDemo}`; }
  // la place se remplit : le carré Signal, c'est vous (la sortie de la grille reste réservée à la signature)
  requestAnimationFrame(() => setTimeout(() => $('.place')?.classList.add('is-prise'), 250));
  d.title = `Échange réservé, ${jour(debut)} — Hors Filtre`;
  $('h1')?.focus();
}
$('[data-partager]')?.addEventListener('click', async () => {
  const texte = 'J’ai réservé un échange gratuit avec Hors Filtre pour ma recherche. Si tu veux voir qui ils sont :';
  const url = 'https://horsfiltre.fr/';
  try { if (navigator.share) { await navigator.share({ title: 'Hors Filtre', text: texte, url }); return; } } catch { return; }
  location.href = `https://wa.me/?text=${encodeURIComponent(texte + ' ' + url)}`;
});
