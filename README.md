# horsfiltre-site

Site public de [Hors Filtre](https://horsfiltre.fr), accompagnement à la recherche d'alternance, de stage, de CDD, de CDI et de démarrage en indépendant.

## Structure

```
public/                  Fichiers publiés tels quels
  index.html             Page d'accueil
  _headers               En-têtes de sécurité appliqués par Cloudflare
  .well-known/
    security.txt         Contact sécurité (RFC 9116)
.github/
  workflows/pipeline.yml Contrôles et déploiement
  dependabot.yml         Mises à jour des dépendances
  CODEOWNERS             Relecture obligatoire
docs/adr/                Décisions d'architecture
lighthouserc.json        Seuils de performance et d'accessibilité
.htmlvalidate.json       Règles de validation HTML
```

## Travailler en local

Prérequis : Node.js 22 (voir `.nvmrc`).

```bash
npm ci
npm run lint:html     # validation HTML
npm run lhci          # performance, accessibilité, SEO
npm run dev           # aperçu local avec les en-têtes de production
```

## Cycle de modification

1. Créer une branche depuis `main`.
2. Faire les modifications, avec des commits signés.
3. Ouvrir une demande de fusion : le pipeline vérifie l'absence de secrets, valide le HTML, contrôle les seuils Lighthouse, puis publie une prévisualisation.
4. Vérifier la prévisualisation sur téléphone et sur ordinateur.
5. Fusionner : le pipeline publie en production sur https://horsfiltre.fr.

Aucune modification directe sur `main`. Rien n'est publié si un contrôle échoue.

## Pipeline

| Étape | Rôle | Bloquante |
| --- | --- | --- |
| Détection de secrets | gitleaks sur tout l'historique, binaire épinglé et vérifié par empreinte | Oui |
| Validation HTML | html-validate, règles recommandées | Oui |
| Lighthouse | performance ≥ 90, accessibilité ≥ 95, bonnes pratiques ≥ 90, SEO ≥ 90, LCP ≤ 2,5 s, CLS ≤ 0,1 | Oui |
| Déploiement | Cloudflare Pages ; prévisualisation sur demande de fusion, production sur `main` | — |

## Principes de sécurité

- Actions GitHub épinglées par empreinte de commit, mises à jour par Dependabot avec un délai de 14 jours.
- Permissions du pipeline en lecture seule par défaut.
- Identifiants Cloudflare stockés uniquement dans les environnements GitHub `production` et `preview`, jamais dans le dépôt.
- Aucun déploiement depuis une contribution externe ou une mise à jour Dependabot.
- Dépendances installées depuis le fichier de verrouillage, sans exécution de scripts.

## Configuration initiale

Voir [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
