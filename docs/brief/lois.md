# Les lois du projet

> Extrait mot pour mot du prompt maître v1.1 du 1er novembre 2026, à la phase 0. Toute modification passe d'abord par le prompt.

## 4. Les lois du projet

Ces lois s'appliquent à chaque ligne de code et de texte. Leur version condensée va dans `CLAUDE.md` (section 5.1).

### 4.1 Vérité
1. Rien d'inventé : aucun chiffre, témoignage, prénom, photo, école, entreprise, logo client, numéro SIRET, prix ou délai qui ne vienne d'une source ou de l'équipe.
2. Tout manque devient un jeton visible `[À FOURNIR : description précise]`, et toute hypothèse un jeton `[À VALIDER : …]`. La commande `pnpm a-fournir` les liste dans `docs/a-fournir.md`. Le build de production échoue s'il en reste un sur une page publique.
3. Tout chiffre public passe par un composant `<Chiffre>` qui exige une source déclarée dans `src/content/sources/` (titre, éditeur, date de publication, adresse, date de vérification). Sans source, le build échoue.
4. Les chiffres de Hors Filtre (104 sur 112, délai moyen, entretiens obtenus, satisfaction) seront calculés par l'administration, selon la méthode publiée sur « Comment on compte nos chiffres », et validés par un associé avant publication.
5. Les témoignages sont réels, publiés avec un accord écrit, daté et révocable, et présentés comme une sélection.
6. Pas de fausse rareté : les places du mois viennent de l'agenda réel et disparaissent quand il n'y en a plus.
7. Formulations interdites, parce que fausses ou trompeuses :
   - « Vous ne payez que si vous signez » et « Pas de contrat, pas de facture » : les 50 € de mise en route sont dus dans tous les cas ;
   - toute garantie de résultat (« garanti », « 100 % ») ;
   - « 75 % des CV sont rejetés par des robots » : ce chiffre n'a pas de source et les recruteurs le démentent (section 8.4).

   Formulations justes : « L'essentiel, seulement si vous signez. », « 50 € pour démarrer, le reste seulement si vous signez. », « Pas de contrat, rien de plus à payer. »

### 4.2 Marque
1. Le logo suit le `LISEZ-MOI.md` du kit : fichiers fournis, jamais redessinés ; zone de protection égale à un carré ; 120 px de large au minimum pour le logo horizontal, 32 px pour le symbole complet, symbole simplifié en dessous ; ni ombre, ni dégradé, ni contour, ni rotation, ni déformation ; le carré échappé reste Signal et hors de la grille ; « hors filtre » n'est jamais réécrit dans une autre police ni en majuscules ; pas de ligature « fi » ; jamais sur un fond chargé sans aplat.
2. Le Signal (#FF5B1F) a deux usages : l'action principale, et « vous » (le carré qui sort, le candidat qui réussit). Il n'écrit jamais de texte sur fond clair. Sur fond sombre, il peut écrire un chiffre ou un mot. Le texte d'un bouton Signal est en Encre.
3. Un seul récit visuel : une grille de carrés (le filtre, la pile), un carré qui s'en échappe (vous). Toute illustration, toute 3D, tout motif en dérive : cubes aux arêtes arrondies dans la proportion du logo (rayon 3 pour un côté de 22), même lumière, mêmes matières (craie, encre, Signal).
4. Vouvoiement partout.
5. Les visages sont ceux des candidats signés, avec leur accord. L'équipe se présente par ses prénoms, écoles et parcours, sans photo ni visage généré.

### 4.3 Mouvement
1. Chaque animation explique ou prouve quelque chose. Sinon, elle n'existe pas.
2. Elle se joue à l'arrivée sur sa section. Au chargement, seule l'accroche bouge, et sobrement.
3. Le défilement reste natif : une scène peut suivre la position de défilement, mais rien ne bloque, ne ralentit ni ne détourne le défilement.
4. Avec le réglage « réduire les animations », chaque scène a une version fixe, complète et lisible, choisie avant le premier affichage, sans décalage de mise en page.
5. Toute scène longue a un bouton « Passer ». Pas de son automatique, pas de clignotement de plus de trois fois par seconde.

### 4.4 Performance (budgets bloquants)
- Lighthouse mobile : Performance ≥ 90 sur chaque page (c'est la règle du pipeline) ; Accessibilité ≥ 95, en visant 100 ; Bonnes pratiques ≥ 95 ; SEO ≥ 95.
- Laboratoire : LCP ≤ 2,5 s (viser 1,8 s), CLS ≤ 0,05, TBT ≤ 200 ms. Terrain : INP ≤ 200 ms au 75e centile.
- JavaScript initial : 30 Ko compressés au plus par page de contenu, zéro quand c'est possible. Les scènes 3D se chargent à l'approche de leur section, s'arrêtent hors de l'écran et ne bloquent jamais le premier affichage.
- Polices auto-hébergées, réduites aux caractères utiles : deux fichiers préchargés au plus, 100 Ko au total. Aucune requête vers Google Fonts : l'adresse IP du visiteur partirait chez un tiers.
- Images en AVIF ou WebP, dimensions explicites ; l'image du LCP n'est jamais chargée en différé.
- Aucune bibliothèque d'animation ou de 3D sans un ADR qui prouve qu'elle est nécessaire et chiffre son poids. Le film existant n'en utilise aucune : c'est la norme.
- Toute vidéo du site pèse moins de 1 Mo et s'affiche d'abord en image fixe.

### 4.5 Accessibilité
- WCAG 2.2 niveau AA partout, Coulisses et administration comprises (RGAA 4.1 comme référentiel français).
- Zéro violation sérieuse ou critique à axe ; parcours complet au clavier ; vérification avec VoiceOver (iOS) et NVDA.
- Cibles tactiles de 44 px au moins, focus visible sur tous les fonds, aucune information portée par la seule couleur, contrastes calculés et publiés dans le système de design.
- Formulaires : libellés visibles, aide, erreurs annoncées, attributs `autocomplete`, aucun délai imposé.
- Les légendes du film sont du vrai texte ; chaque scène 3D a une alternative textuelle équivalente.
- Une déclaration d'accessibilité est publiée.

### 4.6 Données et sécurité (ADR-0003)
- AWS en région de Paris (`eu-west-3`) pour toutes les ressources.
- Comptes candidats créés par l'équipe ; invitation par lien à usage unique valable 48 heures ; le candidat choisit lui-même son mot de passe ; seul le hachage est conservé ; passkey proposée.
- Administration derrière Cloudflare Access, groupe Cognito dédié, double authentification obligatoire, journal des accès aux dossiers.
- CV et documents dans un bucket S3 privé et chiffré, accessibles seulement par lien signé de 15 minutes, purgés selon la durée de conservation.
- Suppression des comptes douze mois après la fin de l'accompagnement, par tâche planifiée.
- Journaux conservés 30 jours, sans aucune donnée personnelle, avec alertes sur les erreurs.
- Infrastructure en code (Terraform, pour AWS et Cloudflare) ; aucune ressource créée à la main ; déploiement par GitHub Actions en OIDC, sans aucune clé stockée.
- Aucune donnée d'authentification dans `localStorage`.
- Le dépôt est public : aucune donnée personnelle, aucune preuve de consentement, aucun avis juridique, aucun détail des 112 accompagnements n'y entre. Ces éléments vivent dans un stockage privé (bucket S3 chiffré du compte de production, ou dépôt privé) ; le dépôt ne contient que ce qui est publié.
- API conforme à l'OWASP ASVS niveau 2 ; chaque accès à un dossier vérifie côté serveur que la personne y a droit.

### 4.7 Langue
- Phrases courtes, un message par écran, un verbe d'action par bouton.
- Les questions du public deviennent des titres : « Combien ça coûte ? », « Et si c'est une arnaque ? ».
- Pas de jargon RH ni d'anglicisme inutile : « logiciel de tri » plutôt qu'« ATS » (expliqué une fois), « échange » plutôt que « call », jamais « booster ».
- Typographie française appliquée automatiquement à la compilation : espace insécable avant ; : ! ? et à l'intérieur des guillemets « », espace fine insécable dans les nombres (« 1 200 € »), apostrophe typographique, majuscules accentuées (« À vos côtés »). Les heures s'écrivent « 14 h 30 », sur tout le site.
- Tournures épicènes d'abord ; le point médian est toléré dans les intitulés de poste (« chargé·e »), jamais dans un titre.
- Identifiants de code en anglais ; tout ce que lisent l'équipe et le public, en français.

### 4.8 Interdits
- L'esthétique d'IA générique : dégradés violet-bleu décoratifs, verre dépoli partout, emojis en guise de puces, formes 3D molles, grilles « bento » sans raison, tout centré, icônes de banque d'images.
- Les signaux d'arnaque : logos d'entreprises « qui nous font confiance », compteurs qui défilent vers des chiffres non prouvés, comptes à rebours, fenêtres surgissantes, chat qui s'ouvre seul, photos de banque d'images, visages générés.
- Les données structurées Review ou AggregateRating sur nos propres pages : c'est de l'auto-promotion, non éligible et risquée.
- Les intégrations tierces lourdes (Calendly, Typeform, widgets d'avis) : la réservation est construite (ADR-0003).
- Le lorem ipsum, les textes provisoires non balisés, les murs de texte.
