# ADR-0005 — Authentification de l'administration au 17 novembre

Statut : acceptée le 3 novembre 2026
Date : 2026-11-02
Décideur : Ilyas Laarif, pour l'équipe Hors Filtre
Cadre : ADR-0003, loi 4.6 du prompt maître, décision Q1 de l'équipe du 2 novembre

## Contexte

L'administration des créneaux part en production le 17 novembre, avant le reste de l'administration. Elle donne accès aux réservations : prénoms, adresses e-mail, numéros de téléphone. L'ADR-0003 et la loi 4.6 exigent Cloudflare Access devant l'administration, et un groupe Cognito avec double authentification obligatoire. L'équipe a décidé de s'y conformer dès le 17, avec un repli possible au point de contrôle du 10 novembre.

## Options comparées

| Critère | A — Un groupe dans un pool Cognito unique | B — Un pool Cognito réservé aux administrateurs | C — Access seul (repli) |
| --- | --- | --- | --- |
| Double authentification obligatoire | Le réglage est par pool : il faudrait un déclencheur Lambda pour l'imposer au seul groupe | Imposée par le pool lui-même | Dépend du fournisseur d'identité |
| Conformité à l'ADR-0003 | Oui | Oui, et plus stricte | Non : amendement nécessaire |
| Les candidats (Coulisses) | Dans le même pool, double authentification facultative | Dans un pool séparé, ADR-0006 | Sans objet |
| Effort pour le 17 novembre | Moyen, avec un déclencheur à tester | Faible : configuration Terraform | Le plus faible |

## Décision

Option B, dans le respect de l'ADR-0003 : un **pool Cognito réservé aux administrateurs**, contenant le groupe `administrateurs`, avec la double authentification **obligatoire**.

- **Pool** : niveau Essentials, région `eu-west-3`, aucune inscription libre ; les quatre comptes sont créés par l'équipe. Second facteur : application d'authentification (TOTP) ou passkey. Mot de passe d'au moins 14 caractères.
- **Connexion** : la page de connexion gérée par Cognito, en flux « authorization code » avec PKCE. Jetons d'accès d'une heure, conservés en mémoire, jamais dans `localStorage`.
- **Devant l'interface** : l'administration est servie sur `admin.horsfiltre.fr`, protégée par une application Cloudflare Access qui n'autorise que les adresses des quatre associés. Elle n'est accessible à personne d'autre, même avec un compte Cognito.
- **Devant l'API** : les routes `/v1/admin/*` passent par l'autorisation JWT native d'API Gateway, reliée au pool des administrateurs ; chaque fonction vérifie en plus l'appartenance au groupe `administrateurs`.
- **Traçabilité** : chaque modification de créneau, de règle ou de réservation est journalisée avec l'identifiant de l'administrateur et l'horodatage, sans donnée personnelle du candidat dans le journal.

## Repli

Si, le 10 novembre, la connexion Cognito ne fonctionne pas en préproduction, l'administration part le 17 derrière Cloudflare Access seul : l'interface et les routes d'administration sont alors servies sous `admin.horsfiltre.fr`, et chaque fonction vérifie la signature du jeton Access. Ce repli fera l'objet d'un ADR qui amende explicitement l'ADR-0003, pour une durée limitée.

## Conséquences

- Les candidats auront leur propre pool aux Coulisses (ADR-0006), avec une double authentification facultative et des règles différentes.
- Les quatre associés doivent configurer leur second facteur à la première connexion.
- La CSP de l'administration est distincte de celle du site public, et autorise le domaine de connexion de Cognito.
