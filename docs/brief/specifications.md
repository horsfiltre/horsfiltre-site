# Spécifications

> Extrait mot pour mot du prompt maître v1.1 du 1er novembre 2026, à la phase 0. Toute modification passe d'abord par le prompt.

## 9. Spécifications par espace

### 9.1 Plan du site et navigation

| Adresse | Page |
|---|---|
| `/` | Accueil |
| `/methode` | La méthode |
| `/tarifs` | Tarifs |
| `/histoires`, `/histoires/[prenom]` | Histoires (page individuelle seulement avec accord) |
| `/parents` | Vous êtes parent ? |
| `/equipe` | L'équipe |
| `/questions` | Questions |
| `/ressources`, `/ressources/[sujet]` | Ressources |
| `/test` | Votre CV passe-t-il le filtre ? |
| `/chiffres` | Comment on compte nos chiffres |
| `/reserver`, `/reserver/confirmation`, `/reserver/gerer/[jeton]` | Réservation, confirmation, annulation ou report |
| `/coulisses/…` | Les Coulisses (connexion, invitation, espace) |
| `/admin/…` | Administration (derrière Cloudflare Access) |
| `/mentions-legales`, `/cgv`, `/confidentialite`, `/cookies`, `/accessibilite`, `/plan-du-site` | Pages légales et utiles |
| 404, 500, maintenance | Pages système |

- En-tête : le logo, puis Méthode, Histoires, Tarifs, Parents, et le bouton Réserver. Sur téléphone : le logo, Réserver, le menu.
- Bouton WhatsApp flottant (« Une question ? »), qui ne masque jamais un bouton d'action.
- Pied de page : toutes les autres pages, l'identité légale, le médiateur de la consommation, et l'accès discret aux Coulisses.

### 9.2 Accueil, en sept écrans

| Écran | Fond | Message | Éléments forts | Mots |
|---|---|---|---|---|
| 1 | Clair | Le système de candidature est truqué. | L'accroche, « Réserver un échange gratuit », « Tester mon CV », les places du mois, « 104 sur 112 ». Le titre est l'élément LCP. | ≈ 20 |
| 2 | Sombre | La preuve | Le film « La pile », qui finit sur « 104 sur 112 » et « La prochaine place est peut-être la vôtre. », puis la rangée de chiffres sourcés et le lien « Comment on compte nos chiffres » | ≈ 25, hors légendes du film |
| 3 | Clair | Ils ont signé | Les parcours signés | ≈ 30 |
| 4 | Clair | Comment on fait | La méthode en quatre temps et la vision rayons X | ≈ 20 |
| 5 | Lavande | Combien ça coûte | Le simulateur, « Pas de contrat, rien de plus à payer. », le lien vers la page parents | ≈ 30 |
| 6 | Clair | Votre CV passe-t-il le filtre ? | L'entrée du test | ≈ 20 |
| 7 | Violet | Les Coulisses, et l'appel final | La démonstration, « Réserver », les places du mois | ≈ 30 |

Les cinq engagements apparaissent en version compacte à l'écran 5 ou 7 ; leur version complète vit sur Tarifs et sur la page parents.

### 9.3 La méthode
Montrer le travail : les quatre étapes en détail, semaine par semaine (ce que vous faites, ce que nous faisons, ce que vous obtenez) ; la vision rayons X en grand ; un aperçu des Coulisses ; ce que nous ne faisons pas [À VALIDER, en lien avec la section 11.1] ; l'appel à réserver.

### 9.4 Tarifs
Lever le doute sur l'argent : le prix doit se trouver sans aide, en deux gestes au plus depuis n'importe quelle page. Le modèle en une phrase ; le simulateur (curseur et saisie au clavier) ; trois exemples (alternance, stage, premier CDI) [À VALIDER] ; ce qui est garanti par écrit ; les cas particuliers (section 8.2) ; les moyens de paiement ; les liens vers les CGV et la page parents.

### 9.5 Histoires
Les parcours signés, réels, trois au lancement ; des filtres (alternance, stage, CDI ; école ; secteur) au-delà de six. Une page par histoire, seulement avec accord. Sous les témoignages : « Témoignages réels, publiés avec l'accord écrit de chacun. Sélection de [N] parcours sur [N]. », la date de recueil, et le lien vers les conditions de publication.

### 9.6 Vous êtes parent ?
Rassurer ceux qui paient, sur leur ton à eux : posé, chiffré, sans jargon jeune. Qui nous sommes (entreprise déclarée, SIRET, associés, écoles) ; combien ça coûte (simulateur « Si votre enfant signe à … ») ; comment ça se passe (calendrier, points d'étape) ; ce qu'on garantit ; vos questions (arnaque, remboursement, données, suivi : un point d'étape partagé seulement avec l'accord de votre enfant [À VALIDER]) ; un contact direct ; « Réserver un échange » (vous pouvez y assister [À VALIDER]).

### 9.7 L'équipe
Prénoms, écoles, parcours et rôle de chacun. Des avatars géométriques tirés de la grille du symbole, un motif par personne : jamais de photo ni de visage généré. Plus tard, en option : un message vocal ou une courte vidéo du fondateur.

### 9.8 Questions
Questions courtes, réponses en une phrase suivies d'un lien. Classées par thème (prix, méthode, confiance, données, parents), avec une recherche instantanée et des données structurées FAQPage.

### 9.9 Ressources
Une page d'accueil et des articles (MDX) : auteur, date, temps de lecture, sources en bas de page, liens vers le test et la réservation. Parmi les dix sujets du lot 4 : « Le tri des candidatures : ce que le logiciel fait vraiment à votre CV » (le mythe démonté, sources à l'appui) et « Aides à l'embauche 2026 : pourquoi viser les PME pour une alternance bac+3 ou bac+5 ».

### 9.10 Le test du filtre
Huit questions, une par écran sur téléphone, avec progression et retour arrière. Score immédiat sur 100 et trois conseils prioritaires, sans e-mail obligatoire. Le guide complet part par e-mail sur demande ; toute lettre d'information demande un consentement distinct. Le score est calculé dans `packages/shared` et testé. Les questions portent sur ce que les recruteurs trient vraiment : l'intitulé de poste repris de l'offre, une seule colonne, des résultats chiffrés, les mots-clés de l'offre, un PDF en texte, l'adaptation à chaque offre, la candidature dans les premiers jours, la relance. Le test note un CV face au tri, jamais la valeur d'une personne.

### 9.11 Comment on compte nos chiffres
Les définitions (qui est « accompagné », ce que « signé » veut dire, la période couverte, les exclusions comme les accompagnements en cours), la date de mise à jour, l'associé qui valide, les sources des chiffres du marché. La page est produite à partir de l'administration.

### 9.12 Réserver
Point de départ : `docs/sources/08-reservation-ebauche/` (HTML et JavaScript, avec un mode démonstration), dans le style Pulse v3, à aligner sur les décisions ci-dessous.
- Titre : « Réserver un échange gratuit », comme les boutons de l'accueil. Sous-titre : « Trente minutes pour faire le point sur votre recherche, en visio ou sur WhatsApp. Gratuit et sans engagement. »
- Étape 1 : « Choisissez un jour ». Étape 2 : « Choisissez une heure ». Les créneaux pris restent visibles mais désactivés. Heures au format « 14 h 30 », heure de Paris ; si le fuseau du visiteur diffère, son heure locale s'affiche sous chaque créneau.
- Étape 3 : « Vos coordonnées ». Prénom ; e-mail (« Pour la confirmation, et les rappels. ») ; ce que vous cherchez (une alternance, un stage, un CDI, un CDD, une première mission en freelance, une orientation) ; le mode d'échange (en visio ou sur WhatsApp) ; le numéro WhatsApp, demandé seulement si l'échange se fait sur WhatsApp ; « Qu'est-ce qui vous a décidé ? », facultatif, qui mesure le troisième indicateur de l'Étude.
- Pas de case de consentement, décision de l'équipe : la base légale est l'exécution de mesures précontractuelles prises à la demande de la personne. Une mention d'information suffit : « Vos informations servent uniquement à organiser cet échange. », avec le lien vers la politique de confidentialité.
- Récapitulatif du créneau marqué du carré Signal, bouton « Réserver l'échange », puis « Échange réservé ». Mention : « Vous pourrez annuler ou reporter à tout moment depuis l'e-mail de confirmation. »
- Règles d'agenda : échanges de 30 minutes ; 15 minutes de pause entre deux échanges ; réservation au plus tôt 12 heures avant, et au plus tard 3 semaines à l'avance ; tous les jours de la semaine possibles, selon ce que l'équipe publie ; rappels la veille et une heure avant.
- Visio : un lien Google Meet fixe par associé, envoyé dans l'e-mail de confirmation. Les parents sont bienvenus à l'échange si le candidat le souhaite.
- Confirmation immédiate : e-mail avec fichier d'agenda, bouton « Ajouter à mon agenda » sur la page, page « Préparer votre échange » en trois conseils, lien signé pour annuler ou reporter. Une copie part à `contact@horsfiltre.fr`.
- États : créneau pris entre-temps (message, rechargement, proposition du plus proche) ; plus aucun créneau (liste d'attente réelle) ; échec du chargement des créneaux ; erreur réseau, avec l'adresse de contact.
- La disponibilité est toujours lue en direct : aucun cache sur les créneaux, et le serveur a le dernier mot au moment de réserver.
- Sélecteur accessible : des groupes de boutons radio, jamais un calendrier en grille seul.

### 9.13 Les Coulisses
- Accès : invitation par lien unique de 48 heures, choix du mot de passe, passkey proposée ; mot de passe oublié ; déconnexion de tous les appareils.
- Accueil : « Cette semaine » (trois actions au plus), progression dans la méthode, prochain rendez-vous, nouveautés.
- Mes candidatures : un tableau en colonnes sur ordinateur, une liste groupée par statut sur téléphone. Statuts : Envoyée, Relancée, Entretien planifié, Proposition reçue, Signée ; Refusée et Sans réponse sont archivées. Ajout en trois champs ; relance suggérée sept jours après l'envoi [À VALIDER] ; historique.
- Mes documents : CV et ses versions, lettres, fiches entreprise, préparations d'entretien. Dépôt en PDF ou Word, 10 Mo au plus, type vérifié ; téléchargement par lien signé de 15 minutes ; qui a déposé quoi, et quand.
- Guides réservés aux accompagnés.
- Mon accompagnant : son prénom, le prochain point, WhatsApp.
- Paiement : l'état de la mise en route ; à la signature, le montant calculé par la formule unique, et la facture [À DÉCIDER par ADR : prestataire de paiement et facturation].
- Mes données : export, demande de suppression, durée de conservation affichée.
- Notifications par e-mail (nouveau document, relance, rendez-vous), réglables.
- La signature : un moment sobre (le carré orange s'échappe), la carte « Sortie de la pile » si le candidat le veut, et la demande de témoignage, avec un consentement détaillé élément par élément (prénom, photo, école, entreprise, chiffres).

### 9.14 Administration
- Accès : Cloudflare Access, puis Cognito (groupe des administrateurs, double authentification obligatoire). La solution retenue pour le 17 novembre est fixée par l'ADR-0005.
- Tableau de bord : rendez-vous du jour et de la semaine, candidats actifs (40 au plus), charge par accompagnant (10 au plus), alertes (candidature sans action depuis sept jours, comptes à supprimer, documents en attente).
- Créneaux : publication et modification depuis l'administration (récurrences, exceptions, absences, fermeture d'un créneau), sans pull request ni déploiement ; chaque réservation retire le créneau immédiatement ; la capacité calcule les places du mois. Livré dès le 17 novembre (lot 6), avec la liste des réservations à venir.
- Rendez-vous : présence, conversion en candidat (création du compte et invitation).
- Candidats : fiche, accompagnant, étape, documents, issue (si signé : date, type de contrat, entreprise, salaire brut pour la facture), facturation.
- Journal des accès aux dossiers, exigé par l'ADR : qui, quand, quoi ; consultable, jamais modifiable.
- Témoignages et consentements : preuve de l'accord (date, périmètre, version du texte), publication, retrait immédiat du site.
- Chiffres publics : calcul automatique, validation par un associé, historique. Ils alimentent le compteur et la page `/chiffres`.
- Contenus : pas de CMS au lancement. Les textes vivent dans le dépôt, versionnés ; l'administration ne gère que les données vivantes.
- Exports, registre et demandes RGPD.

### 9.15 Pages légales et système
- Mentions légales : éditeur, directeur de la publication, hébergeurs (Cloudflare pour le site, AWS pour la plateforme ; coordonnées à vérifier).
- CGV : prix et modalités, droit de rétractation de quatorze jours et exécution anticipée sur demande expresse, médiateur de la consommation, responsabilité, absence de garantie de résultat, cas particuliers.
- Politique de confidentialité : traitements, bases légales, durées, sous-traitants (Cloudflare, AWS, PostHog), droits.
- Cookies et consentement : refuser doit être aussi simple qu'accepter.
- Déclaration d'accessibilité ; conditions de publication des témoignages.
- Page 404 utile (recherche, liens, Réserver), page 500, page de maintenance.

Tout texte juridique est un brouillon marqué [À VALIDER PAR UN AVOCAT].

### 9.16 E-mails
Confirmation de rendez-vous (avec fichier d'agenda), rappel une heure avant, annulation ou report, invitation aux Coulisses (lien de 48 heures), nouveau document, rappel de relance, félicitations et facture à la signature, préavis de suppression du compte, guide du test. En français, accessibles, avec une version texte, aux couleurs de la marque, testés dans les principales messageries, envoyés depuis un domaine dédié.

### 9.17 Mesure
- Cloudflare Web Analytics : fréquentation et signaux web essentiels, sans cookie.
- PostHog (Union européenne), après consentement : `reserver_clic` (avec l'emplacement), `reservation_etape` (1, 2, 3), `reservation_confirmee`, `simulateur_utilise`, `test_demarre`, `test_termine` (tranche de score), `guide_demande`, `whatsapp_clic`, `parents_vue`, `film_termine`, `rayons_x_bascule`, `histoire_retournee`.
- Un tableau de bord des trois indicateurs de l'Étude.

### 9.18 Partage
Images de partage par page, générées à partir de la grille ; le film en 9:16 et en 1:1 ; la carte « Sortie de la pile ».

## 10. Architecture technique, dans le cadre de l'ADR-0003
- Dépôt pnpm : `apps/site` (Astro, après le 17 novembre ; jusque-là, le site statique reste dans `public/`), `apps/api` (fonctions Lambda en TypeScript), `packages/shared` (types, schémas zod, formule de prix, score du test, règles des créneaux), `infra/terraform` (AWS et Cloudflare), `docs/`. Le dépôt actuel utilise npm : le passage à pnpm se décide dans l'ADR-0004.
- Site : Astro en sortie statique sur Cloudflare Pages ; TypeScript strict ; îlots en TypeScript natif d'abord, Preact et Signals seulement là où l'état devient complexe (réservation, Coulisses, administration) ; CSS natif (variables, `@layer`, requêtes de conteneur), sans framework utilitaire ; collections de contenu typées (histoires, avec seulement les champs publiés, les preuves d'accord restant hors du dépôt ; ressources, questions, équipe, sources, chiffres).
- API : API Gateway HTTP et Lambda (dernière version LTS de Node.js proposée par Lambda), sur `api.horsfiltre.fr`, derrière Cloudflare ; autorisation JWT native reliée à Cognito, vérifiée avant d'exécuter le moindre code.
- Données : DynamoDB à table unique (chapitre 8 du document d'architecture v1.0), chiffrement au repos, restauration à un instant donné ; S3 privé et chiffré ; SES en région de Paris ; EventBridge Scheduler ; Cognito Essentials.
- Session : aucune donnée d'authentification dans `localStorage`. La stratégie de session et l'écran de connexion sont décidés par ADR (par exemple la connexion gérée de Cognito en flux PKCE, habillée aux couleurs de la marque, ou des écrans maison), dans le respect de l'ADR-0003.
- Paiement et facturation : hors du champ de l'ADR-0003, décidés par un nouvel ADR.
- Sécurité web : en-têtes dans `_headers` : CSP stricte sans aucun code intégré, comme dans la branche `refonte-accueil-pulse`, complétée par `https://api.horsfiltre.fr` dans `connect-src` et par `https://challenges.cloudflare.com` dans `script-src` et `frame-src` pour Turnstile ; HSTS par paliers ; Referrer-Policy, Permissions-Policy, frame-ancestors. Turnstile sur les formulaires publics ; règles de limitation de débit Cloudflare.
- Comptes : AWS Organizations, avec `horsfiltre-org`, compte de gestion vide, et deux comptes membres : `horsfiltre-prod`, comme l'exige l'ADR, et `horsfiltre-preprod`. IAM Identity Center pour les accès nominatifs ; une politique de contrôle des services limite les ressources à `eu-west-3`, hors services mondiaux.
- Intégration et déploiement : GitHub Actions en OIDC ; plan Terraform commenté sur la pull request, application manuelle validée ; Lighthouse CI, Playwright (bout en bout, non-régression visuelle, axe), Vitest ; Dependabot.
- Exploitation : alarmes CloudWatch par e-mail, journaux de 30 jours sans données personnelles, notifications Cloudflare, alerte de budget à 1 $, restauration testée et documentée avant la mise en ligne.
