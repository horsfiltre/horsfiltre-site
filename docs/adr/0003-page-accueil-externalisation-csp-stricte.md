# ADR-0003 — Page d'accueil : code externalisé, polices auto-hébergées, CSP stricte

**Statut** : acceptée
**Date** : 31 octobre 2026
**Décideur** : Ilyas Laarif

## Contexte

La page d'accueil a été refondue. La version retenue, « Pulse », comporte deux dispositifs qui
portent la promesse de la marque : un film en 3D temps réel (WebGL2, moteur écrit pour le projet,
sans bibliothèque) qui montre ce qu'un CV subit dans une pile de candidatures, et une loupe
« rayons X » qui montre ce qu'un recruteur pressé retient d'un CV.

La page d'origine portait son CSS et son JavaScript à l'intérieur du HTML, et chargeait ses polices
depuis Google Fonts. Deux conséquences : la CSP devait tolérer `'unsafe-inline'`, et l'adresse IP de
chaque visiteur était transmise à un tiers hors Union européenne.

## Décision

1. **CSS et JavaScript dans des fichiers séparés** : `/styles.css` et `/app.js`.
2. **Aucun attribut `style` ni gestionnaire d'événement dans le HTML** : tout passe par des classes
   et par `addEventListener`.
3. **Polices auto-hébergées** dans `/fonts/`, au format WOFF2, réduites aux caractères et aux
   graisses réellement utilisés : 67 Ko au total, contre 194 Ko pour les fichiers d'origine.
4. **CSP stricte** : `'unsafe-inline'` retiré de `script-src` et de `style-src`, plus aucun domaine
   Google autorisé.
5. **Icônes, image de partage et manifeste** issus du kit logo.

## Conséquences

- Plus aucune requête vers un tiers : conformité RGPD sans bannière pour les polices.
- Une injection de code dans le HTML ne peut plus s'exécuter.
- `app.js` étant un vrai fichier JavaScript, CodeQL l'analyse désormais : la langue JavaScript peut
  être activée dans l'analyse par défaut, ce qui lève un point resté en attente.
- Le film ne prépare sa scène 3D qu'au premier défilement du visiteur, et seulement à l'approche de
  la section : un visiteur qui ne descend pas n'en paie jamais le coût.
- Toute évolution devra respecter la CSP : pas de `<style>`, pas d'attribut `style`, pas de
  `onclick`. Le pipeline ne le vérifie pas automatiquement ; c'est au relecteur d'y veiller.

## Mesures

Relevés sur trois passages de Lighthouse en simulation mobile, polices servies localement.

| Indicateur | Avant externalisation | Après |
| --- | --- | --- |
| Performance mobile (médiane) | 70 | 94 |
| Accessibilité | 97 | 100 |
| Bonnes pratiques | 100 | 100 |
| Référencement | 100 | 100 |
| Violations axe-core (WCAG 2.2 AA) | 1 sérieuse | 0 |
| Erreurs HTML (html-validate) | 8 | 0 |
| Décalage de mise en page | 0 | 0 |

**Réserve** : la performance mesurée varie de 88 à 99 selon la charge de la machine de test, qui ne
dispose pas d'accélération graphique. Le seuil du pipeline, fixé à 90, porte sur la médiane et passe,
mais la marge est mince. Si le pipeline échouait de façon intermittente sur GitHub, deux leviers
existent : différer davantage le chargement du moteur 3D, ou mesurer la performance sur une page
témoin sans WebGL.

## Alternatives écartées

- **Conserver le code intégré** avec des empreintes dans la CSP : illisible et à régénérer à chaque
  modification.
- **Garder Google Fonts** : impose une bannière de consentement et transmet les adresses IP.
- **Utiliser une bibliothèque 3D** (three.js, Spline) : plusieurs centaines de kilooctets, pour un
  rendu que le moteur écrit pour le projet obtient en 46 Ko.
