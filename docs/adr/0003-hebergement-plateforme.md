# ADR-0003 — Hébergement de la plateforme candidat

**Statut** : acceptée le 27 octobre 2026 — option C, Cloudflare et AWS
**Décideur** : Ilyas Laarif, pour l'équipe Hors Filtre
**Document complet** : `docs/sources/02-adr-0003-hebergement.pdf`, hors du dépôt public

Ce fichier résume la décision pour le dépôt. En cas d'écart, le document complet fait foi.

## Décision

- Option C : le site reste chez Cloudflare ; l'API, les données, les comptes et les e-mails sont sur AWS, en région de Paris (`eu-west-3`).
- Comptes candidats : lien d'invitation à usage unique, valable 48 heures ; seul le hachage du mot de passe est conservé.
- Statistiques : Cloudflare Web Analytics, puis PostHog en hébergement européen après consentement.

## Conséquences, non optionnelles

- Compte AWS dédié `horsfiltre-prod`, offre payante, budget d'alerte à 1 $, région de Paris pour toutes les ressources, compte racine protégé par passkey, sans clé d'accès.
- Accès des associés : un accès nominatif par personne via IAM Identity Center, avec double authentification et droits minimaux. Aucun utilisateur IAM avec clé permanente.
- Déploiement : GitHub Actions s'authentifie par fédération OIDC, sans aucune clé stockée dans GitHub.
- Infrastructure en code : Terraform pour AWS et Cloudflare, état dans un bucket S3 chiffré et versionné avec verrouillage natif.
- API : fonctions Lambda derrière une API Gateway HTTP sur `api.horsfiltre.fr`, protégée par Cloudflare, avec l'autorisation JWT native reliée à Cognito.
- Comptes candidats : Cognito, niveau Essentials ; passkey proposée.
- Administrateurs : groupe Cognito dédié avec double authentification obligatoire, et pages d'administration derrière Cloudflare Access.
- Données : DynamoDB, chiffrement au repos, restauration à un instant donné.
- CV et documents : S3 privé, chiffré, liens signés de 15 minutes, purge automatique.
- E-mails : SES en région de Paris, DKIM, domaine d'envoi dédié, SPF, sortie du mode d'essai avant le lancement.
- Tâches planifiées : rappels et suppression des comptes douze mois après la fin, par EventBridge Scheduler.
- Journaux : 30 jours, aucune donnée personnelle, alertes sur les erreurs.

## Réexamen

À revoir si les conditions des offres changent, si l'équipe dépasse une centaine de candidats actifs, ou au moment d'intégrer la génération de documents par IA.
