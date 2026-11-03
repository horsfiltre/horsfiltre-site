# Plan

> Extrait mot pour mot du prompt maître v1.1 du 1er novembre 2026, à la phase 0. Toute modification passe d'abord par le prompt.

## 6. Le plan en lots

Chemin critique : la prise de rendez-vous et l'administration des créneaux doivent être en production au plus tard le 17 novembre 2026, sur le site statique actuel (décision de l'équipe : la migration en Astro attend). L'ordre est donc : lot 0, puis lot 6, puis le reste. Les lots 1 à 4 avancent en parallèle sans jamais retarder le lot 6.

Calendrier à rebours :
- du 2 au 4 novembre : lot 0 ; l'équipe dépose la demande de sortie du mode d'essai SES dès le premier jour ;
- du 4 au 12 novembre : lot 6 en préproduction ;
- 10 novembre : SIRET et numéro WhatsApp fournis ; pages légales de l'étape 1 rédigées ;
- du 12 au 14 novembre : tests de bout en bout, test des cinq prospects sur la prévisualisation ;
- 15 et 16 novembre : mise en production validée par l'équipe ;
- 17 novembre : ouverture.

**Lot 0 — Urgences et socle** (du 2 au 4 novembre)
- Dépendances : trier et corriger les dix vulnérabilités signalées par Dependabot sur `main`, en commençant par ce que touche le job de déploiement, qui détient le jeton Cloudflare.
- Pull request n° 2 : dater l'étude Indeed du 16 janvier 2024, avec la formulation exacte de la section 8.4.
- Amazon SES : le texte de la demande de sortie du mode d'essai, prêt à déposer ; la vérification du domaine `horsfiltre.fr` (DKIM) ; un domaine personnalisé pour l'adresse de retour (MAIL FROM) ; le SPF mis à jour en conservant OVH ; l'alignement DMARC. Les e-mails partent de `contact@horsfiltre.fr` ; les réponses arrivent sur la messagerie OVH existante.
- AWS Organizations : le pas à pas pour créer `horsfiltre-org` (compte de gestion vide), y rattacher `horsfiltre-prod`, créer `horsfiltre-preprod`, activer IAM Identity Center et limiter les régions par une politique de contrôle des services. L'équipe l'exécute.
- Terraform : état dans S3, rôle GitHub Actions en OIDC pour chaque compte, sans clé.
- ADR-0004 (organisation du dépôt et de la stack pour l'étape 1, compatible avec la migration en Astro) et ADR-0005 (authentification de l'administration pour le 17 novembre).
- Le contrat d'API de la réservation et de l'administration des créneaux, écrit avant le code (OpenAPI).

**Lot 1 — Étude de marque approfondie** → `docs/etude/01-marque.md` (produite par l'équipe dans claude.ai, section 5.6 : lis-la, ne la refais pas)
- Plateforme de marque : raison d'être, promesse, preuves, personnalité en quatre traits « c'est / ce n'est pas », archétype et tension créative (dénoncer le système, faire passer les gens), territoire de métaphores (le filtre, la pile, sortir, les coulisses, la signature).
- Matrice promesse → preuve → source : chaque promesse du site adossée à une preuve existante, ou marquée À FOURNIR.
- Voix et ton : règles, lexique (à dire, à ne jamais dire), dix réécritures avant/après tirées des planches.
- Carte concurrentielle (axes : prix opaque ou transparent ; outil seul ou humain jusqu'à la signature), avec au moins dix acteurs français réels, et la place unique de Hors Filtre.
- Risques de marque et parades : « truqué » mal compris, soupçon d'arnaque, promesse excessive, conformité du paiement au succès (section 11.1), dépendance au mythe du robot.
- La fierté d'en être : les mécanismes honnêtes qui la créent.

Critère : chaque affirmation cite sa source (document et section).

**Lot 2 — Benchmark mondial** → `docs/etude/02-benchmark.md`, `docs/etude/captures/`, `docs/etude/benchmark.csv`

Au moins 30 sites, dont 8 en analyse approfondie. Pour chacun : une visite réelle, des captures en 390 et 1440 px, le score PageSpeed mobile mesuré, puis la grille :
1. la promesse retenue en cinq secondes ;
2. la première action proposée ;
3. les preuves et leur sourçage ;
4. le prix : visibilité, clarté, simulateur ;
5. la confiance : garanties, mentions, humains ;
6. le mouvement : ce qu'il explique, ce qui le déclenche, sa version réduite ;
7. la typographie, le rythme, les mots par écran ;
8. la couleur, la matière, la 3D ;
9. le mobile : zone du pouce, action toujours accessible ;
10. l'accessibilité (passage rapide d'axe) ;
11. le ton ;
12. à voler : trois éléments précis au plus ;
13. à refuser.

Points de départ, à vérifier en ligne et à compléter par les derniers lauréats Awwwards, FWA et CSS Design Awards :
- Retenue haut de gamme et récit : Apple (pages produit), Tesla, Linear, Stripe.
- Énergie jeune et culture des réseaux : Duolingo, Spotify Wrapped, Nike, Back Market, Brut.
- Confiance et prix transparent : Alan, Qonto, Pretto (dans le courtage, les honoraires ne sont dus qu'au déblocage du prêt : un modèle au succès que les parents connaissent), Airbnb (le design de la confiance), Doctolib (réserver en trois gestes).
- Emploi et alternance : Welcome to the Jungle et BlaBlaCar (déjà analysés par l'Étude), JobTeaser, La bonne alternance, 1jeune1solution, HelloWork, Indeed, et les cinq concurrents payants les plus visibles en accompagnement de candidature : leurs prix, leurs preuves, leurs failles.
- Artisanat 3D et mouvement : les dix derniers « Site of the Day » ou « Site of the Month » Awwwards en WebGL, et les travaux des studios Lusion, Active Theory et Resn.
- Rigueur, contenu, accessibilité : GOV.UK (principes de rédaction), Vercel Geist, Shopify Polaris (rédaction), guide de style de Mailchimp, Material 3 (mouvement).
- Espaces connectés, pour Les Coulisses : Linear (états, rapidité), Things (calme), Revolut et Qonto (statuts, notifications), l'espace patient de Doctolib.

Synthèse : les 15 éléments à voler, classés par effet attendu sur la confiance et la réservation, et les 10 pièges à refuser.

**Lot 3 — Principes et système de design** → `docs/etude/03-principes.md`, la page vivante `/systeme` (non indexée), les jetons en CSS
- Les dix lois de design de Hors Filtre, déduites des lots 1 et 2, chacune illustrée.
- La direction Pulse v3 définie à partir de la branche `refonte-accueil-pulse` : le clair par défaut, le sombre pour le film et Les Coulisses, et la version sombre complète, selon le réglage de l'appareil, à concevoir pour la migration en Astro.
- Typographie décidée par l'équipe : Bricolage Grotesque pour les titres, Geist pour le texte, Schibsted Grotesk réservée au logo, Caveat seulement pour la signature des parcours signés. Consigne-la dans un ADR, sans refaire de test.
- Jetons : couleurs et rôles, avec la table des contrastes calculée ; échelle typographique fluide ; espacements ; rayons ; ombres ; grille (4 colonnes en mobile, 12 en ordinateur) ; mouvement (durées, courbes, règles) ; profondeur.
- Direction artistique 3D unique : géométrie des cubes, matières, lumière, brume, caméra. Rendu temps réel avec le moteur du film ; images fixes rendues depuis la même scène ; Midjourney (avec référence de style) seulement pour ce que le code ne sait pas faire.
- Composants, chacun avec ses états, au clavier et en mode réduit : boutons (principal à relief, doux, discret), puces de statut, cartes, cartes à retourner, `<Chiffre>` sourcé, simulateur, étapes, sélecteur de créneaux, champs, alertes, feuille modale, en-tête, pied de page, bouton WhatsApp flottant, accordéon, carte de candidature, ligne de document, progression, états vides, d'erreur et de chargement.

**Lot 4 — Architecture, parcours et contenus** → `docs/contenu/`
- Plan du site et adresses (section 9.1) ; parcours complets des trois personnages, du lien WhatsApp ou LinkedIn jusqu'à la réservation.
- Pour chaque page, une fiche : objectif, question du visiteur, sections dans l'ordre, élément signature, preuves, appel à l'action, budget de mots, événements mesurés, titre et description pour les moteurs de recherche.
- Tout le texte du site, prêt à intégrer, avec trois propositions d'accroche par page et ton choix motivé.
- Plan éditorial des Ressources : dix sujets, avec intention de recherche, plan et sources.

Critère : l'accueil tient en 175 mots environ, légendes du film non comprises ; aucun texte provisoire non balisé.

**Lot 5 — Le site public, en Astro** (après le 17 novembre)
Migration de l'accueil Pulse v3 de la branche `refonte-accueil-pulse`, avec le thème sombre selon le réglage de l'appareil, puis toutes les pages de la section 9, dans cet ordre : Accueil, Tarifs, Réserver (interface), Vous êtes parent ?, La méthode, Histoires, Questions, Comment on compte nos chiffres, L'équipe, Test du filtre, Ressources, pages légales et système. Les pièces signatures sont finalisées (section 8.7).

**Lot 6 — Prise de rendez-vous et administration des créneaux** (étape 1 de l'ADR, chemin critique, du 4 au 14 novembre)
- API : Lambda derrière une API Gateway HTTP sur `api.horsfiltre.fr` ; table DynamoDB ; écritures conditionnelles, pour que deux personnes ne réservent jamais le même créneau.
- E-mails SES depuis `contact@horsfiltre.fr` : confirmation avec fichier d'agenda et, selon le mode choisi, le lien Google Meet de l'associé ou l'annonce de l'appel WhatsApp ; rappel la veille ; rappel une heure avant ; annulation et report par lien signé ; une copie à `contact@horsfiltre.fr` à chaque réservation.
- EventBridge Scheduler pour les rappels ; Turnstile et limitation de débit ; liste d'attente réelle quand il n'y a plus de créneau.
- Interface de réservation sur le site statique actuel, au thème clair, à partir de `08-reservation-ebauche/` (section 9.12).
- Administration des créneaux, exigence de l'équipe : depuis son compte administrateur, l'équipe publie et modifie les disponibilités quand elle le veut (règles récurrentes, exceptions, absences, fermeture d'un créneau), sans pull request ni déploiement ; chaque réservation retire le créneau immédiatement, pour tous les visiteurs ; la liste des réservations à venir, avec l'annulation. Le reste de l'administration attend le lot 8.
- Calcul des places du mois : les créneaux de premier échange restants.

Critère : tests de bout en bout verts en préproduction (réservation, conflit simultané, annulation, report, rappels, publication et retrait de créneaux depuis l'administration) ; domaine d'envoi authentifié (DKIM, SPF, DMARC) ; sortie du mode d'essai SES accordée ; mise en production validée par l'équipe le 16 novembre au plus tard.

**Lot 7 — Les Coulisses** (étape 2 de l'ADR) : section 9.13.

**Lot 8 — Administration** : section 9.14.

**Lot 9 — Ressources** : trois articles complets et sourcés, sept autres en briefs.

**Lot 10 — Recette et mise en production** : conformité (section 11) et liste de mise en ligne (section 12).
