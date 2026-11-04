# API de la réservation

Code qui parle à AWS. Les règles elles-mêmes sont dans `shared/` : ici, seulement ce qui touche DynamoDB, et plus tard les gestionnaires de l'API.

## Ce qu'il y a

| Fichier | Rôle |
| --- | --- |
| `src/stockage-dynamodb.mts` | Le stockage de la réservation dans DynamoDB. Remplit le contrat de `shared/src/stockage.mts`. |
| `test/stockage-dynamodb.test.mts` | Ses réactions aux réponses de DynamoDB que l'on ne peut pas provoquer à volonté : conflits de transaction, échecs de condition, erreurs inattendues. Un faux client scripté, sans AWS. |
| `test-integration/dynamodb.integration.mts` | La suite du contrat, contre une vraie table. |

## Pourquoi un contrat commun

`shared/test/contrat-stockage.mts` décrit ce qu'un stockage doit faire : une seule réservation par créneau même en cas de demandes simultanées, une annulation qui libère le créneau, un report qui ne change rien en cas d'échec. Il tourne contre l'implémentation en mémoire (à chaque `npm test`) et contre DynamoDB (test d'intégration). Une implémentation qui ne passe pas exactement les mêmes tests n'est pas une implémentation du contrat.

## Les transactions

Réserver, annuler et reporter sont des **transactions DynamoDB** : elles réussissent en entier ou ne changent rien, et leurs conditions sont évaluées par DynamoDB au moment de l'écriture. Quand deux transactions touchent le même élément en même temps, DynamoDB rejette l'une avec le code `TransactionConflict` : l'adaptateur la rejoue jusqu'à trois fois, puis répond « créneau indisponible ».

## Lancer le test d'intégration

Il écrit des données d'essai datées de 2030, avec un accompagnant unique par test, et les supprime. **Il refuse de tourner contre une table dont le nom ne commence pas par `preprod-`.**

```powershell
aws sso login --profile horsfiltre-prod
$env:AWS_PROFILE = "horsfiltre-prod"
$env:TABLE_NAME = "preprod-horsfiltre"
npm.cmd run test:integration
```

Résultat attendu : `# tests 12`, `# pass 12`, `# fail 0`.

## Les routes d'administration

Quinze routes sous `/v1/admin/` (`src/admin.mts`) : accompagnants, règles de disponibilité, absences, créneaux, réservations, et la liste des réservations à risque. Le contrat est `docs/api/reservations.openapi.yaml`, et un test compare automatiquement ses opérations aux routes du code.

**Contrôle d'accès, fait avant toute route d'administration** (`src/http.mts`) :

| Situation | Réponse |
| --- | --- |
| Aucune identité vérifiée | 401, `WWW-Authenticate: Bearer` |
| Identité hors du groupe `administrateurs` | 403 |
| Membre du groupe `administrateurs` | la route s'exécute |

Le nom du groupe est comparé **exactement** : `administrateurs-externes` ou `ADMINISTRATEURS` n'ouvrent rien. L'identité vient du jeton Cognito, vérifié par API Gateway ; la fonction n'en lit que l'identifiant et les groupes (`groupesDepuisClaim`).

**Origines** : l'administration n'accepte que `originesAdministration` (par exemple `https://admin.horsfiltre.fr`). Le site public ne peut pas l'appeler depuis un navigateur, et l'administration ne peut pas appeler les routes publiques.

**Audit** : chaque modification, et chaque lecture de coordonnées de candidats, laisse une trace `admin_action` avec l'identifiant opaque de l'acteur. Le journal ne contient **jamais** d'adresse e-mail, de prénom, de numéro de téléphone, de lien de visioconférence, de motif d'absence ni de message d'annulation : un test le vérifie.

**Rendez-vous déjà pris** : modifier une règle, ajouter une absence ou désactiver un accompagnant ne supprime jamais un créneau réservé. La création d'une absence rend les réservations concernées ; `GET /v1/admin/conflits` liste à tout moment celles qui ne correspondent plus aux disponibilités.

## Déployer en préproduction

La fonction (`src/lambda.mts`) se construit en un seul fichier avec `esbuild` : `npm.cmd run construire:api` produit `dist/api.zip`, identique octet pour octet d'une construction à l'autre. L'infrastructure est dans `infra/terraform/environnements/preprod` ; son README donne l'ordre : construire, créer les deux secrets à la main, planifier, appliquer, créer les comptes des administrateurs.

`scripts/appeler-administration.mts` (dossier `api/scripts/`) teste la chaîne réelle : connexion Cognito avec double authentification, puis appel d'une route d'administration. Le jeton n'est jamais affiché.

## Amorcer les accompagnants

Les associés ne se créent pas par l'API : un script les écrit dans la table, à partir d'un **fichier qui reste sur votre poste**. Les liens de visioconférence n'entrent donc jamais dans le dépôt ni dans une conversation. Le dossier `docs/sources/` est ignoré par Git.

Une ligne par accompagnant, dans `docs/sources/accompagnants.txt` :

```text
# identifiant : Prénom : lien Meet fixe
ilyas : Ilyas : https://meet.google.com/xxx-xxxx-xxx
```

L'identifiant est court, en minuscules, sans espace ni accent. Il ne change plus ensuite : les règles et les créneaux s'y rattachent.

```powershell
$env:AWS_PROFILE = "horsfiltre-prod"
$env:TABLE_NAME = "preprod-horsfiltre"
node api\scripts\amorcer-accompagnants.mts              # simulation : n'écrit rien
node api\scripts\amorcer-accompagnants.mts --appliquer  # écrit
```

Le script est **idempotent** : relancé avec le même fichier, il affiche « inchangé ». Il montre les liens **masqués** (`https://meet.google.com/abc-****-***`), refuse tout fichier qui contient une erreur sans rien écrire, et refuse une table de production sans l'option `--production`.

## Ajouter une dépendance

Les dépendances **indirectes** comptent pour la règle des quatorze jours : un kit comme celui d'AWS publie tous ses modules en même temps, et npm choisit tout seul la dernière version de chacun. On résout donc comme à une date donnée, celle d'il y a quatorze jours :

```powershell
npm.cmd install --save-dev --save-exact --ignore-scripts --before=AAAA-MM-JJT00:00:00.000Z paquet@version
```

Puis on contrôle l'âge de tout ce que le verrou a ajouté, avant de commiter.

## Ce qui n'est pas encore là

Les gestionnaires de l'API (réservation, annulation, administration), l'envoi des e-mails, les rappels, et le déploiement des fonctions.

## Démarrage de Chrome dans le contrôle de performance

Sur un exécuteur GitHub, Chrome met parfois trop de temps à ouvrir son port de débogage : `chrome-launcher` échoue alors avec « waiting for dynamic debugging port in chrome-err.log », **avant toute mesure**. Le script `scripts/lighthouse.mjs` rejoue le démarrage jusqu'à trois fois et affiche la fin du journal de Chrome à chaque échec. **Seul le démarrage est rejoué** : une mesure qui dépasse un seuil n'est jamais refaite, car un second passage vert masquerait un défaut de marge.
