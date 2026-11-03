# Conformité et mise en ligne

> Extrait mot pour mot du prompt maître v1.1 du 1er novembre 2026, à la phase 0. Toute modification passe d'abord par le prompt.

## 11. Conformité : points bloquants avant la mise en ligne

### 11.1 Paiement au succès et droit du travail
L'article L5321-3 du Code du travail interdit d'exiger des personnes à la recherche d'un emploi une rétribution, directe ou indirecte, en contrepartie de services de placement. L'équipe déclare que Hors Filtre ne met jamais un candidat en relation avec une entreprise : seulement le CV, le ciblage et la préparation. L'avocat consulté a rendu un avis écrit : pas de risque, montage à deux facturations compris. Cet avis est conservé hors du dépôt public.

Conséquence permanente : le site, les CGV et Les Coulisses décrivent un accompagnement, jamais une mise en relation ni une transmission de candidature. Toute fonction qui transmettrait un CV à une entreprise, et tout texte qui le laisserait entendre, est interdit sans un nouvel avis de l'avocat.

### 11.2 Consommation
CGV et information avant la commande ; droit de rétractation et exécution anticipée ; médiateur de la consommation désigné et affiché, ce qui est obligatoire depuis 2016 pour toute vente à des consommateurs.

Décidé : l'accompagnement commence aussitôt, sur demande expresse du client ; s'il se rétracte ensuite, il paie la part déjà exécutée [À VALIDER PAR UN AVOCAT : formulation exacte]. Le médiateur reste à désigner [À FOURNIR avant le 17 novembre : comparatif de l'équipe].

### 11.3 Avis et témoignages
Articles L111-7-2 et L121-4 du Code de la consommation : dire si les témoignages sont contrôlés et comment, les dater, les présenter comme une sélection, annoncer toute contrepartie. Le consentement RGPD est distinct et révocable.

Décidé : accord écrit, élément par élément (prénom, photo, école, entreprise, chiffres), daté et révocable. Les preuves d'accord restent hors du dépôt public.

### 11.4 Allégations
Chaque chiffre public est vérifiable (section 4.1).

### 11.5 RGPD
Registre des traitements ; durées de conservation (candidats : douze mois après la fin ; prospects non convertis : à fixer, la CNIL retient en général trois ans après le dernier contact) ; contrats de sous-traitance avec Cloudflare, AWS et PostHog ; information au moment de la collecte ; exercice des droits.

### 11.6 Accessibilité
La directive européenne sur l'accessibilité exempte en principe les microentreprises de services (moins de dix salariés et moins de 2 millions d'euros de chiffre d'affaires). Le niveau AA s'applique quand même ici, et une déclaration est publiée.

## 12. Liste de mise en ligne
- Domaines et DNS (horsfiltre.fr, api, domaine d'envoi) ; DKIM, SPF et DMARC ; sortie du mode d'essai SES accordée par AWS.
- Cloudflare Access configuré et testé ; double authentification active pour les quatre associés.
- Alerte de budget, alarmes, sauvegardes, restauration testée.
- Zéro [À FOURNIR] et zéro [À VALIDER] ouvert sur les pages publiques.
- Avis écrit de l'avocat archivé hors du dépôt (section 11.1) ; SIRET, domiciliation, médiateur et numéro WhatsApp publiés.
- Test des cinq prospects de l'Étude, mené par l'équipe sur la prévisualisation dès que l'accueil, les tarifs et la réservation existent : trois étudiants en recherche d'alternance, un bac+5 et un parent ; test des cinq secondes ; deux tâches (trouver combien ça coûte, réserver un échange) ; une note de confiance de 1 à 10, et ce qui l'aurait fait monter. Réussite : quatre sur cinq retiennent la promesse et trouvent le prix sans aide. Tu prépares le protocole, les tâches et la grille.
- Lighthouse et axe au vert sur toutes les pages en production.
- Plan de retour arrière écrit.
