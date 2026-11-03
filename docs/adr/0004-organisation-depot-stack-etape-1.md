# ADR-0004 — Organisation du dépôt et stack de l'étape 1

Statut : proposée
Date : 2026-11-02
Décideur : Ilyas Laarif, pour l'équipe Hors Filtre
Cadre : ADR-0003 (Cloudflare devant, AWS derrière), prompt maître v1.1

## Contexte

La réservation et l'administration des créneaux doivent être en production le 17 novembre 2026, sur le site statique actuel. La migration du site en Astro vient ensuite. Le dépôt doit accueillir dès maintenant une API, du code partagé et de l'infrastructure en code, sans gêner cette migration ni ajouter de risque au calendrier.

Le dépôt utilise npm, avec un verrou strict et une règle : aucune version publiée depuis moins de 14 jours dans le job qui détient un secret.

## Options comparées

| Critère | A — pnpm et monorepo dès maintenant | B — npm et espaces de travail, pnpm avec Astro | C — dépôts séparés pour l'API et l'infrastructure |
| --- | --- | --- | --- |
| Risque pour le 17 novembre | Changement d'outillage sur le chemin critique | Aucun changement d'outil | Trois pipelines à créer |
| Partage des types et des règles | Natif | Natif (espaces de travail npm) | Par paquet publié, à versionner |
| Migration en Astro | Prête | Un changement d'outil au lot 5 | Indépendante |
| Contrat d'API | Un seul dépôt | Un seul dépôt | Réparti |

## Décision

Option B. npm reste l'outil jusqu'à la migration en Astro, où le passage à pnpm sera réévalué.

```text
public/                  site statique, inchangé jusqu'au lot 5
api/                     fonctions Lambda en TypeScript (espace de travail npm, lot 6)
shared/                  types, schémas, formule de prix, règles des créneaux (espace de travail npm, lot 6)
infra/terraform/
  amorcage/              fournisseur OIDC de GitHub et rôles de déploiement, par compte
  modules/               api, donnees, courriel, planification, identite, dns
  environnements/
    preprod/
    prod/
docs/api/                contrat OpenAPI, qui fait foi
scripts/                 outils du dépôt (contrôle Lighthouse)
```

- **Exécution** : Node.js 22 sur AWS Lambda, architecture arm64, en région `eu-west-3`. Code en TypeScript, empaqueté par esbuild, sans couche Lambda.
- **Tests** : le lanceur intégré de Node (`node:test`). Chaque bibliothèque ajoutée doit être justifiée et respecter la règle des 14 jours.
- **API** : API Gateway HTTP sur `api.horsfiltre.fr`, certificat régional ; la disponibilité des créneaux n'est jamais mise en cache.
- **Données** : DynamoDB en table unique, selon le chapitre 8 du document d'architecture v1.0 ; facturation à la demande, restauration à un instant donné, protection contre la suppression.
- **Secrets** : la clé secrète de Turnstile dans le magasin de paramètres AWS (SSM Parameter Store, type chiffré), lu au démarrage de la fonction.
- **Contrôle Lighthouse** : `@lhci/cli` est remplacé par `lighthouse` 13.5.0 et `scripts/lighthouse.mjs` : trois passages par page, médiane comparée aux seuils de `lighthouse.budgets.json`.

## Conséquences

- `@lhci/cli` 0.15.1, dernière version publiée, embarque Lighthouse 12.6.1 et vingt dépendances vulnérables sans correctif. Son remplacement supprime ces vulnérabilités.
- Lighthouse 13.5.0 est plus exigeant que la version 12.6.1 : il a révélé deux défauts d'accessibilité sur la page en ligne (contraste et zone principale), corrigés dans ce lot.
- `undici` est forcé en 7.30.1 (publiée le 15 octobre 2026) : elle corrige huit failles dont une contournant la validation des certificats TLS, dans la chaîne de `wrangler`, le job qui détient le jeton Cloudflare. `wrangler` 4.156.1, qui embarque le correctif, sera adopté une fois âgé de 14 jours.
- Sept alertes restent ouvertes, toutes dues à `basic-ftp`, appelé par Lighthouse seulement pour télécharger à travers un proxy FTP. Ce code ne s'exécute jamais dans le dépôt ; aucune version de `get-uri` n'utilise encore la version corrigée. Sur décision de l'équipe du 2 novembre, elles sont classées dans Dependabot avec le motif « Vulnerable code is not actually used », et réexaminées à chaque mise à jour de Lighthouse.
- Seuils alignés sur la loi 4.4, décision de l'équipe du 2 novembre : bonnes pratiques et référencement à 95, CLS à 0,05 ; performance à 90 et LCP à 2,5 s, inchangés. Le TBT est mesuré sans bloquer jusqu'au 9 novembre, puis son seuil est fixé d'après les mesures relevées sur GitHub : en local, il a varié de 45 à 364 ms d'un passage à l'autre sur l'accueil Pulse.
- L'accueil Pulse franchit tous les seuils, mais son LCP médian (2,2 s) dépasse l'objectif de 1,8 s de la loi 4.4 : à traiter lors de la migration en Astro.
