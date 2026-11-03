# Hors Filtre — règles du projet

Site et plateforme d'un service d'accompagnement humain vers l'alternance, le stage et le premier emploi. Ces règles condensent le prompt maître v1.1 du 1er novembre 2026 ; le détail est dans `docs/brief/`. En cas de doute, l'ordre d'autorité est : ADR-0003, prompt maître, décisions de l'équipe, Étude, branche `refonte-accueil-pulse`, planches Pulse.

## Mode de travail
- Mode **accompagné** : à la fin de chaque lot, un jalon (`docs/brief/plan.md`) ; on attend la réponse de l'équipe avant de continuer.
- L'équipe exécute les commandes sensibles : comptes AWS, `terraform apply` en production, DNS, demande SES, fusion sur `main`. On prépare tout, avec un pas à pas PowerShell (Windows 10).
- Une branche et une pull request par lot, commits conventionnels signés, deux contrôles obligatoires verts avant toute fusion.
- Échéance : réservation et administration des créneaux en production le **17 novembre 2026**, sur le site statique actuel. Astro après.

## Vérité (bloquant)
- Rien d'inventé : aucun chiffre, témoignage, prénom, photo, école, entreprise, SIRET, prix ou délai sans source ou sans l'équipe.
- Un manque devient `[À FOURNIR : …]`, une hypothèse `[À VALIDER : …]`. Aucun ne doit rester sur une page publique en production.
- Chaque chiffre public cite sa source, sa date de publication et sa date de vérification. Les chiffres de Hors Filtre suivent la méthode publiée et sont validés par un associé.
- Interdit : « Vous ne payez que si vous signez », « Pas de contrat, pas de facture », toute garantie de résultat, « 75 % des CV rejetés par des robots ». Le filtre est un système (volume, critères éliminatoires, mots-clés, quelques secondes de lecture, silence), jamais un robot qui jette les CV.
- Formulations justes : « L'essentiel, seulement si vous signez. » ; « 50 € pour démarrer, le reste seulement si vous signez. » ; « Triés en quelques secondes. »
- Pas de fausse rareté : les places du mois viennent de l'agenda réel.
- Hors Filtre ne met jamais un candidat en relation avec une entreprise : aucun texte, aucune fonction ne doit le laisser entendre (article L5321-3 du Code du travail).

## Marque
- Logo : fichiers du kit, jamais redessinés ; zone de protection d'un carré ; 120 px minimum en horizontal ; « hors filtre » jamais réécrit ; pas de ligature « fi ».
- Signal `#FF5B1F` : l'action principale et « vous ». Jamais de texte Signal sur fond clair ; le texte d'un bouton Signal est en Encre `#121530`.
- Un seul récit visuel : une grille de carrés, un carré qui s'en échappe.
- Vouvoiement. Visages : ceux des candidats signés, avec accord écrit. L'équipe : prénoms, écoles, parcours, sans photo ni visage généré.
- Direction **Pulse v3** (la Fusion est rejetée). Titres en Bricolage Grotesque, texte en Geist, Schibsted Grotesk réservée au logo, Caveat seulement pour la signature des parcours signés.

## Mouvement
- Chaque animation explique ou prouve. Au chargement, seule l'accroche bouge.
- Défilement natif, jamais détourné. Bouton « Passer » sur toute scène longue.
- « Réduire les animations » : version fixe, complète, choisie avant le premier affichage.
- Le film ne prépare sa 3D qu'au premier défilement, à l'approche de sa section. Ne jamais revenir à une préparation au chargement.

## Performance (bloquant)
- Lighthouse mobile ≥ 90 en performance sur chaque page (médiane de trois passages), ≥ 95 ailleurs, 100 visé en accessibilité.
- LCP ≤ 2,5 s, CLS ≤ 0,05, TBT ≤ 200 ms en laboratoire.
- JavaScript initial ≤ 30 Ko compressés par page de contenu. Pas de bibliothèque de 3D ou d'animation sans ADR.
- Polices auto-hébergées, deux fichiers préchargés, 100 Ko au plus. Aucune requête vers Google Fonts.

## Accessibilité
- WCAG 2.2 AA partout (RGAA 4.1). Zéro violation sérieuse ou critique à axe ; parcours complet au clavier.
- Cibles de 44 px, focus visible, aucune information par la seule couleur.
- Formulaires : libellés visibles, erreurs annoncées et reliées, `autocomplete`, aucun délai imposé.
- Bordure d'un champ : contraste d'au moins 3:1 (`#7D8299`, pas `#E3E4EC`).

## Sécurité et données (ADR-0003)
- AWS en `eu-west-3`. Comptes : `horsfiltre-org` (gestion, vide), `horsfiltre-prod`, `horsfiltre-preprod`. Accès nominatifs par IAM Identity Center, double authentification.
- Infrastructure en Terraform ; seules exceptions, documentées : l'amorçage de l'organisation et des comptes, le bucket d'état, la demande de sortie du mode d'essai SES.
- Déploiement par GitHub Actions en OIDC, sans aucune clé stockée.
- Administration : Cloudflare Access et groupe Cognito dédié avec double authentification (voir ADR-0005).
- Écritures conditionnelles : deux personnes ne réservent jamais le même créneau.
- Journaux 30 jours, sans donnée personnelle.
- **Le dépôt est public** : aucune donnée personnelle, preuve de consentement, avis juridique, détail des accompagnements, CV, ni document interne (`docs/sources/` reste hors de Git).
- HSTS par paliers, dans `public/_headers` : 1 jour le 3 novembre 2026, puis 1 semaine, 1 mois, 6 mois, une étape à la fois. `includeSubDomains` quand `api.horsfiltre.fr` répondra en HTTPS ; `preload` jamais avant un an.
- Les polices sont hébergées sur le site (`public/fonts/`) : aucune requête vers Google.
- CSP stricte sans aucun code intégré : pas de `<style>`, pas d'attribut `style=`, pas de `<script>` intégré, pas d'`onclick`. Toute nouvelle origine (`api.horsfiltre.fr`, Turnstile) s'ajoute dans `public/_headers`.

## Dépendances
- Règle des 14 jours : aucune version publiée depuis moins de 14 jours dans le job qui détient un secret. Vérifier avec `npm view <paquet> time --json`.
- Actions GitHub épinglées par empreinte complète.
- Les dépendances **indirectes** comptent : pour ajouter un paquet, `npm install --save-dev --save-exact --ignore-scripts --before=<date d'il y a 14 jours> <paquet>@<version>`, puis contrôler l'âge de tout ce que le verrou a ajouté (voir `api/README.md`).

## Langue
- Phrases courtes, un message par écran, un verbe d'action par bouton.
- Typographie française : espace insécable avant ; : ! ? et dans « », espace fine dans « 1 200 € », apostrophe typographique, heures au format « 14 h 30 ».
- Identifiants de code en anglais ; tout ce que lisent l'équipe et le public, en français.

## Interdits
- L'esthétique d'IA générique, les signaux d'arnaque (logos « ils nous font confiance », comptes à rebours, fenêtres surgissantes, chat qui s'ouvre seul, visages générés).
- Les intégrations tierces lourdes (Calendly, Typeform, widgets d'avis).
- Les données structurées Review ou AggregateRating sur nos propres pages.
- Le lorem ipsum et les murs de texte.

## Commandes
- `npm run lint:html` : validation HTML.
- `npm run lighthouse` : trois passages par page, médiane comparée à `lighthouse.budgets.json` (ADR-0004).
- `/audit`, `/a-fournir`, `/lighthouse`, `/captures` : commandes de projet dans `.claude/commands/`.

## Où trouver quoi
- `docs/brief/lois.md`, `dossier-de-marque.md`, `specifications.md`, `plan.md`, `conformite.md` : le prompt, mot pour mot.
- `docs/00-comprehension.md` : la compréhension du projet et les arbitrages de la phase 0.
- `docs/adr/` : les décisions d'architecture.
- `docs/operations/` : les pas à pas que l'équipe exécute.
