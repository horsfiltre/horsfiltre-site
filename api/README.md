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

## Ajouter une dépendance

Les dépendances **indirectes** comptent pour la règle des quatorze jours : un kit comme celui d'AWS publie tous ses modules en même temps, et npm choisit tout seul la dernière version de chacun. On résout donc comme à une date donnée, celle d'il y a quatorze jours :

```powershell
npm.cmd install --save-dev --save-exact --ignore-scripts --before=AAAA-MM-JJT00:00:00.000Z paquet@version
```

Puis on contrôle l'âge de tout ce que le verrou a ajouté, avant de commiter.

## Ce qui n'est pas encore là

Les gestionnaires de l'API (réservation, annulation, administration), l'envoi des e-mails, les rappels, et le déploiement des fonctions.
