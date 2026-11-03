# Demande de sortie du mode d'essai d'Amazon SES

**Déposée le 2 novembre 2026**, en ligne de commande depuis CloudShell dans `horsfiltre-prod` : la page « Configurer » de la console ne proposait qu'un assistant de vérification d'identité, ce que Terraform doit faire. Statut relevé le jour même : `PENDING`. La réponse d'AWS reste attendue : à transférer telle quelle.

**À faire par l'équipe aujourd'hui, lundi 2 novembre 2026.** Sans cet accord, Amazon SES n'envoie des e-mails qu'à des adresses vérifiées une par une : aucun candidat ne recevrait sa confirmation. Le délai d'examen d'AWS est variable, et AWS peut poser des questions complémentaires : c'est le point le plus long du chemin critique.

## Où la déposer

1. Connectez-vous à la console AWS sur le compte **`horsfiltre-prod`**.
2. En haut à droite, choisissez la région **Europe (Paris) `eu-west-3`**. L'accord vaut pour une seule région.
3. Ouvrez **Amazon SES**, puis **Account dashboard** (tableau de bord du compte).
4. Cliquez sur **Request production access** (demander l'accès en production).
5. Remplissez les champs comme ci-dessous, puis envoyez.

La demande ne crée aucune ressource : elle respecte la règle « aucune ressource à la main ». La vérification du domaine, elle, sera faite par Terraform au lot 0.

## Champs du formulaire

| Champ | Valeur |
| --- | --- |
| Mail type | **Transactional** |
| Website URL | `https://horsfiltre.fr` |
| Additional contacts | `contact@horsfiltre.fr` |
| Preferred contact language | English |

Le texte est en anglais : les équipes qui examinent ces demandes répondent plus vite en anglais.

## Use case description — texte à coller

```text
Hors Filtre (https://horsfiltre.fr) is a French career-coaching service. We help students and young graduates find apprenticeships, internships and first jobs. The new version of our website is currently in preview at https://refonte-accueil-pulse.horsfiltre.pages.dev and will go live on November 17, 2026.

We will use Amazon SES in eu-west-3 exclusively for transactional emails, each triggered by a person's own action on our website:
- confirmation of a free 30-minute call booked on our booking page, with a calendar file attached;
- a reminder the day before the call, and another one hour before it;
- confirmation of a cancellation or a rescheduling, made through a signed link;
- a notification when a slot opens, sent only to people who joined the waiting list for that purpose;
- a copy of each booking sent to our own team mailbox.

We do not send marketing or promotional email through Amazon SES. We never buy, rent or share email lists. Every recipient has entered their own address on our booking form, for that booking only.

Expected volume: a few hundred emails per month at launch, and fewer than 3,000 per month over the next year, with fewer than 100 per day.

Sender address: contact@horsfiltre.fr. The domain horsfiltre.fr will be verified with Easy DKIM, a custom MAIL FROM subdomain and SPF, and it already publishes a DMARC policy.

Bounces and complaints: we enable the SES account-level suppression list for both bounces and complaints. A configuration set publishes bounce, complaint and delivery events to Amazon EventBridge; a Lambda function marks the address as undeliverable in our database, so it is never emailed again. Amazon CloudWatch alarms alert the team if the bounce rate exceeds 2% or the complaint rate exceeds 0.05%, well below the SES review thresholds. Every email identifies Hors Filtre and gives a contact address, and every booking email includes a link to cancel.

The infrastructure is managed with Terraform in a dedicated AWS account. Access is limited to named team members with multi-factor authentication.
```

## Ce que chaque engagement implique

Chaque phrase de ce texte engage Hors Filtre auprès d'AWS. Elles sont toutes prévues au lot 6 :
- la liste de suppression au niveau du compte et l'ensemble de configuration (Terraform) ;
- la fonction qui marque les adresses non délivrables ;
- les deux alarmes CloudWatch, à 2 % de rebonds et 0,05 % de plaintes ;
- le lien d'annulation dans chaque e-mail de réservation.

## Après l'envoi

- AWS répond par e-mail, sur l'adresse du compte et sur `contact@horsfiltre.fr`. Transférez la réponse dès réception.
- Si AWS pose des questions, ne répondez pas seul : envoyez-les, je prépare la réponse.
- En cas de refus, AWS indique en général ce qui manque. On corrige et on redépose : c'est pour cela qu'il faut déposer dès le premier jour.
