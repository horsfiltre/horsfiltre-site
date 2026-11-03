# Compréhension du projet — phase 0

Rédigée le 2 novembre 2026, à partir du prompt maître v1.1 et de toutes les sources disponibles.

## Le projet, en dix lignes

1. Hors Filtre accompagne des étudiants et jeunes diplômés vers l'alternance, le stage et le premier emploi : CV, ciblage, préparation, jusqu'à la signature. Quatre associés, dix candidats actifs chacun au plus.
2. Le public est méfiant, découragé, souvent pressé par une date ; les parents paient ou décident. Il part au moindre signe d'arnaque, de prix flou ou de texte trop long.
3. Le site a un seul objectif : transformer une visite en réservation d'un premier échange gratuit de 30 minutes, en rassurant.
4. La promesse : le système de candidature est truqué ; on vous apprend à le traverser. Le filtre est un système, pas un robot.
5. La preuve : 104 accompagnés sur 112 ont signé, des parcours réels et signés, un prix transparent avec simulateur.
6. Le prix : 50 € à la remise du CV, puis 15 % du premier salaire, plafonné à 350 €, seulement en cas de signature.
7. L'accueil Pulse v3 existe déjà en HTML statique, corrigé et testé, dans la pull request n° 2.
8. Il manque l'essentiel pour ouvrir : la prise de rendez-vous et l'administration des créneaux, sur AWS, pour le 17 novembre.
9. Ensuite : la migration en Astro avec le thème sombre, les autres pages, puis Les Coulisses, l'espace des accompagnés.
10. Tout se juge sur trois chiffres : réservations par mois, part des visiteurs qui réservent, part des prospects convaincus par le site.

## Contradictions et arbitrages

| N° | Contradiction | Arbitrage proposé | Statut |
| --- | --- | --- | --- |
| 1 | La loi 4.6 et l'ADR-0003 exigent Cognito et la double authentification pour l'administration ; la v1.1 laissait ouvert « Cloudflare Access seul pour le 17 ». | Se conformer dès le 17 : Access devant, groupe Cognito avec double authentification ; repli sur Access seul seulement si le point de contrôle du 10 novembre l'exige, par un ADR qui amende explicitement l'ADR-0003. | Décidé le 2 novembre |
| 2 | Le modèle de données v1.0 matérialise les créneaux par accompagnant (`ACCOMP#{id}` / `CRENEAU#{début}`) ; l'équipe veut des règles récurrentes. | Les deux : des règles par associé génèrent les créneaux sur trois semaines glissantes ; chaque créneau reste modifiable. Le créneau porte l'associé, donc son lien Google Meet. | Décidé le 2 novembre |
| 3 | La décision d'architecture n° 2 interdit tout chiffre public saisi en dur ; « 104 / 112 » est écrit dans le HTML. | Jusqu'au registre de l'administration complète, un script recalcule les chiffres depuis le fichier de preuve, privé ; la date et la méthode sont publiées, et un associé valide. | Décidé le 2 novembre |
| 4 | Le mode d'emploi du kit fait copier `docs/sources/` dans le dépôt, qui est public ; ces sources contiennent des décisions internes (budget, avis juridique, stratégie). | `docs/sources/` est ignoré par Git et sauvegardé dans un dépôt privé ou un espace de stockage. | Décidé le 2 novembre |
| 5 | « Aucune ressource créée à la main » ; or l'organisation AWS, les comptes, le bucket d'état et la demande SES ne peuvent qu'être amorcés à la main. | Exceptions d'amorçage, limitées et documentées ; tout le reste en Terraform. | Décidé le 2 novembre |
| 6 | Règle des 14 jours : le correctif de `wrangler` (4.156.1) date d'aujourd'hui. `@lhci/cli` n'a aucun correctif. | Forcer `undici` 7.30.1 (17 jours), qui corrige la faille de `wrangler` ; remplacer `@lhci/cli` par `lighthouse` 13.5.0 (44 jours) et un script de seuils. | Décidé le 2 novembre |
| 7 | Deux « ADR-0003 » : celui de l'hébergement (27 octobre) et celui de la page d'accueil, dans la pull request n° 2. Le prompt crée `docs/decisions/`, le dépôt utilise `docs/adr/`. | Garder `docs/adr/` et les numéros du prompt ; l'ADR de la page d'accueil devient ADR-0007. | Décidé le 2 novembre |
| 8 | La v1.1 prévoit un sous-agent critique ; l'exécution se fait dans claude.ai, sans sous-agent. | À chaque jalon, une conversation séparée relit à froid, avec seulement les captures, les mesures et la section 4. | Décidé le 2 novembre |
| 9 | ADR-0003 : « domaine d'envoi dédié » ; décision D10 : envoi depuis `contact@horsfiltre.fr`. | Compatibles : expéditeur `contact@horsfiltre.fr`, signature DKIM du domaine, adresse de retour (MAIL FROM) sur un sous-domaine dédié. | Arbitré |
| 10 | ADR-0003 : rappel une heure avant ; décision D7 : la veille et une heure avant. | Pas de conflit : la décision ajoute un rappel. | Arbitré |
| 11 | La pull request n° 2 date l'étude Indeed de 2023 ; la page liée est publiée le 16 janvier 2024. | Correction au lot 0. | Arbitré |
| 12 | L'ébauche de réservation affiche « 14:30 » ; la règle est « 14 h 30 ». | Correction au lot 6. | Arbitré |

## Manques

- **Bloquants pour le 17 novembre** : SIRET, liens Google Meet des associés, prénoms des associés, numéro WhatsApp Business, domiciliation, médiateur, accord de sortie du mode d'essai SES.
- **Bloquants pour fusionner la pull request n° 2** : les trois témoignages, le CV avant et après, les chiffres et leur méthode.
- **Sources** : `07-signatures/` n'a pas été transmis ; il n'est plus nécessaire, puisque `app.js` de la pull request n° 2 fait foi. L'export du système de design est remplacé par ses fichiers sources (`tokens.json`, `README.md`).
- **Mon accès** : je travaille sur des copies. L'état réel de `main` sur GitHub et des comptes AWS reste à confirmer à chaque lot.
