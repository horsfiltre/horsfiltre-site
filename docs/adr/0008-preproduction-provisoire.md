# ADR-0008 — Préproduction provisoire dans le compte de production

Statut : acceptée le 3 novembre 2026
Date : 2026-11-03
Décideur : Ilyas Laarif, pour l'équipe Hors Filtre
Cadre : ADR-0003, ADR-0004 ; décision de l'équipe du 3 novembre (« si AWS n'a pas accordé le quota de comptes le 5 novembre, une préproduction provisoire »)

## Contexte

L'organisation AWS est plafonnée à deux comptes : `horsfiltre-org` et `horsfiltre-prod`. La demande d'augmentation du quota, déposée le 3 novembre, n'a pas reçu de réponse, et AWS ne garantit aucun délai sur l'offre de support actuelle. Le compte `horsfiltre-preprod`, prévu par l'ADR-0004, ne peut donc pas être créé.

La réservation doit être en production le 17 novembre. Construire l'API et la base de données sans environnement d'essai ferait tester directement en production.

## Décision

Une préproduction **provisoire**, dans le compte `horsfiltre-prod`, avec les mêmes modules Terraform que la production :

- toutes ses ressources portent le préfixe `preprod-` et l'étiquette `environnement = preprod` ;
- son état est séparé (`environnements/preprod.tfstate`) ;
- elle ne contient **que des données d'essai** : aucune vraie donnée de candidat n'y entre ;
- la protection contre la suppression y est désactivée, pour la retirer sans étape de plus.

On démarre le 3 novembre plutôt que le 5, parce que le coût d'une attente est un retard sur le chemin critique, alors que le coût d'avoir commencé est nul : la table est vide et se supprime.

## Ce que ça coûte en isolation

La préproduction et la production partagent un compte. Les droits d'un rôle de la préproduction ne sont donc pas séparés de ceux de la production par la frontière du compte, mais seulement par les noms et par les politiques. Mesures :

- chaque rôle de la préproduction est limité, dans sa politique, aux ressources dont le nom commence par `preprod-` ;
- la production n'a jamais d'accès aux ressources `preprod-` en écriture, et inversement ;
- le rôle de déploiement GitHub (ADR-0003) ne reçoit aucun droit supplémentaire.

## Sortie

Quand le quota est accordé : créer `horsfiltre-preprod`, y appliquer les mêmes modules, vérifier, basculer, puis `terraform destroy` ici. Cet ADR passe alors au statut « remplacée ».

## Alternatives écartées

- **Attendre le quota** : bloque tout le lot 6 sur une décision d'AWS dont on ne maîtrise pas le délai.
- **Tester directement en production** : une erreur d'écriture toucherait de vraies données à partir du 17 novembre.
- **Une organisation AWS séparée, à titre gratuit** : crée un second compte racine, une facturation à part et un second jeu d'accès, pour un besoin de quinze jours.
