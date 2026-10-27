# ADR-0002 — Rendre public le dépôt du site

Statut : acceptée
Date : 2026-10-26

## Contexte

Sur l'offre gratuite de GitHub, plusieurs protections ne sont disponibles que pour les dépôts publics : protection de branche et règles de dépôt, blocage des secrets à l'envoi, environnements avec restrictions de déploiement.

## Décision

Le dépôt du site est public.

## Justification

Le code d'un site statique est déjà lisible par tout visiteur : le rendre public n'expose rien de nouveau. Les secrets ne sont jamais dans le dépôt. En contrepartie, le dépôt gagne gratuitement des protections qui exigeraient sinon un abonnement payant.

## Conséquences

- Aucun secret, aucune donnée personnelle, aucune information interne dans le dépôt, sans exception.
- La licence précise que le contenu n'est pas réutilisable.
- Le dépôt de l'infrastructure, s'il contient des informations sensibles, fera l'objet d'une décision séparée.
