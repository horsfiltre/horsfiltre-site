# Une personne signale une adresse e-mail incorrecte

Pour la réservation, l'e-mail est le seul canal : une adresse fausse prive la personne de la confirmation, du lien de visio, des rappels et du lien pour annuler ou reporter. La page de confirmation lui propose d'écrire à `contact@horsfiltre.fr` ; son message contient l'identifiant de sa réservation, le créneau et sa bonne adresse.

## Ce que le produit sait faire, et ne sait pas faire

- L'administration **liste** et **annule** une réservation. Elle ne sait ni corriger une adresse, ni créer une réservation.
- Le formulaire public refuse tout créneau à moins de 12 heures (`DELAI_MINIMUM_HEURES`). Rebloquer un créneau proche, pour la personne, est donc impossible par le site.
- Annuler envoie un e-mail à l'adresse enregistrée, c'est-à-dire à la mauvaise, et libère le créneau.

## Conduite à tenir

1. **Retrouver la réservation** dans l'onglet Réservations de l'administration, avec ce que le message contient : le **jour et l'heure** de l'échange, le **prénom** et l'**accompagnant**. Deux fiches au même créneau se distinguent par leur **statut** (Confirmée ou Annulée) et par le prénom. L'identifiant de réservation écrit dans le message n'est pas affiché par l'administration : il ne sert qu'à le vérifier avec un développeur.
2. **Ne rien annuler**, sauf le cas particulier ci-dessous. Répondre à la **bonne adresse** : jour et heure de l'échange (heure de Paris), avec quel accompagnant, et le lien de visio de cet accompagnant (onglet Équipe), ou la mention que l'accompagnant appellera sur WhatsApp si c'est le canal choisi.
3. **Laisser la mauvaise adresse telle quelle** : les messages suivants (rappels) lui seront envoyés. Si elle rebondit, la plateforme la marque toute seule comme injoignable. Ce repère n'apparaît pas encore dans l'administration.

## Cas particulier : la mauvaise adresse appartient à quelqu'un d'autre

Cette personne a reçu la confirmation, avec le lien de visio et le lien pour annuler ou reporter.

- Échange à **plus de 12 heures** : annuler la réservation depuis l'administration (le lien reçu par la mauvaise personne cesse alors de fonctionner), puis inviter la personne à réserver de nouveau avec la bonne adresse.
- Échange à **moins de 12 heures** : répondre à la bonne adresse comme ci-dessus. Le lien de visio est celui de l'accompagnant : n'admettre dans la salle que la personne attendue.

## Ce qui n'existe pas encore

Le repère « adresse injoignable » dans l'administration et l'alerte envoyée à l'équipe quand un message de réservation rebondit. Tant qu'ils n'existent pas, c'est la personne qui prévient.
