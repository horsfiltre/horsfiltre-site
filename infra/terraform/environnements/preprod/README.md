# Préproduction provisoire

Données, identité des administrateurs et API de la préproduction, **dans le compte de production** (ADR-0008). Toutes les ressources portent le préfixe `preprod-` et l'étiquette `environnement = preprod`. Elle ne contient que des données d'essai : **aucune vraie donnée de candidat n'y est jamais écrite.**

## Ce qu'elle crée

| Module | Ressources | Rôle |
| --- | --- | --- |
| `donnees` | 1 | la table DynamoDB (déjà créée) |
| `identite` | 4 | pool Cognito des administrateurs, groupe `administrateurs`, page de connexion, client de l'interface |
| `api` | 21 | fonction Lambda et ses droits minimaux, API Gateway (11 routes), autorisation JWT, limites de débit, journaux |

Un plan sur une table déjà créée annonce donc **25 ressources à créer**.

## Avant le plan

**1. Construire la fonction.** Terraform déploie l'archive `dist/api.zip`, qui n'existe pas dans le dépôt.

```powershell
npm.cmd run construire:api
```

**2. Créer les deux secrets.** Un secret ne passe **jamais** par Terraform : il se créerait dans l'état. Les deux paramètres se créent à la main, avec l'accès nominatif, avant le premier déploiement.

Secret de signature des liens d'annulation, 48 octets aléatoires qui ne s'affichent jamais :

```powershell
$octets = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($octets)
$secret = [Convert]::ToBase64String($octets)
aws ssm put-parameter --name /horsfiltre/preprod/jeton-secret --type SecureString --value $secret
Remove-Variable secret, octets
```

Clé secrète Turnstile du widget des aperçus, depuis Bitwarden (la saisie ne s'affiche pas) :

```powershell
$saisie = Read-Host "Clé secrète Turnstile (horsfiltre-apercus)" -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($saisie))
aws ssm put-parameter --name /horsfiltre/preprod/turnstile-secret --type SecureString --value $secret
Remove-Variable saisie, secret
```

Chaque commande répond par un numéro de version et le niveau `Standard`. Une fonction dont l'un des deux secrets manque **refuse de démarrer** et répond une erreur générique : c'est voulu.

## Le plan

```powershell
$env:AWS_PROFILE = "horsfiltre-prod"
cd infra\terraform\environnements\preprod
terraform init
terraform validate
terraform plan -out preprod.tfplan
```

Il doit annoncer **25 to add, 0 to change, 0 to destroy**. Relire le plan, puis seulement : `terraform apply preprod.tfplan`.

Le préfixe de l'adresse de connexion (`horsfiltre-admin-preprod`) est unique dans la région : si un autre compte l'a pris, l'`apply` échoue sur le domaine Cognito, et il suffit de changer ce préfixe dans `main.tf`.

## Après l'apply : les comptes des administrateurs

Les adresses e-mail des associés sont des données personnelles : **elles ne figurent jamais dans le dépôt ni dans Terraform**. Les comptes se créent à la main, un par associé :

```powershell
$pool = terraform output -raw id_pool
aws cognito-idp admin-create-user --user-pool-id $pool --username prenom@exemple.fr --user-attributes Name=email,Value=prenom@exemple.fr Name=email_verified,Value=true --desired-delivery-mediums EMAIL
aws cognito-idp admin-add-user-to-group --user-pool-id $pool --username prenom@exemple.fr --group-name administrateurs
```

L'associé reçoit un e-mail avec un mot de passe temporaire (valable 3 jours). À sa première connexion, il choisit un mot de passe d'**au moins 14 caractères** et configure son application d'authentification : la double authentification est obligatoire, à chaque connexion.

## Tester la chaîne réelle

Vérifications qui ne demandent aucune connexion :

```powershell
$api = terraform output -raw adresse_api
curl.exe -i "$api/v1/creneaux"                                            # 200 : route publique
curl.exe -i "$api/v1/admin/accompagnants"                                  # 401 : refusé par API Gateway, sans jeton
curl.exe -i -H "Authorization: Bearer faux" "$api/v1/admin/accompagnants"  # 401 : un faux jeton ne passe pas
```

Connexion réelle, avec la double authentification, puis un appel d'administration. Le jeton n'est jamais affiché :

```powershell
$env:COGNITO_ADRESSE = terraform output -raw adresse_connexion
$env:COGNITO_CLIENT  = terraform output -raw id_client
$env:API_ADRESSE     = terraform output -raw adresse_api
cd ..\..\..\..
node api\scripts\appeler-administration.mts GET /v1/admin/accompagnants
```

Le script affiche une adresse : l'ouvrir dans le navigateur, se connecter, puis revenir au terminal. Il doit afficher « Groupes : administrateurs » et la liste des accompagnants (code 200).

## Les e-mails

La confirmation, le report et l'annulation partent depuis la fonction de l'API ; les rappels (la veille et une heure avant) depuis une fonction planifiée toutes les 5 minutes ; les rebonds et plaintes sont traités par une troisième fonction, déclenchée par les événements de SES. Tout se règle par la variable `courriel` du module `api` : `null` désactive l'envoi sans toucher à la réservation.

Les droits d'envoi sont limités à l'action `ses:SendRawEmail`, à l'adresse `contact@horsfiltre.fr`, à l'identité `horsfiltre.fr` et à l'ensemble de configuration `horsfiltre-transactionnel`. Les fonctions n'ont aucun autre accès à SES.

**Pourquoi `ses:SendRawEmail`.** Le code appelle `SendEmail` de l'API v2 avec un contenu brut (`Content.Raw`), nécessaire pour joindre le fichier d'agenda. SES contrôle alors la permission `ses:SendRawEmail`. Une politique qui n'accorde que `ses:SendEmail` fait refuser chaque envoi (`AccessDeniedException ... not authorized to perform 'ses:SendRawEmail'`).

**Vérifier les droits après chaque apply** (lecture seule, aucun e-mail ne part). Simulez **l'action réellement contrôlée**, `ses:SendRawEmail` ; les deux ressources doivent répondre `allowed`, pour chacun des deux rôles :

```powershell
foreach ($role in "preprod-horsfiltre-api", "preprod-horsfiltre-api-rappels") {
  aws iam simulate-principal-policy --policy-source-arn "arn:aws:iam::452473973922:role/$role" --action-names ses:SendRawEmail `
    --resource-arns "arn:aws:ses:eu-west-3:452473973922:identity/horsfiltre.fr" "arn:aws:ses:eu-west-3:452473973922:configuration-set/horsfiltre-transactionnel" `
    --context-entries "ContextKeyName=ses:FromAddress,ContextKeyValues=contact@horsfiltre.fr,ContextKeyType=string" `
    --query "EvaluationResults[].ResourceSpecificResults[].[EvalResourceName,EvalResourceDecision]" --output table
}
```

Le simulateur ne remplace pas un envoi réel : la preuve finale est la ligne `courriel_envoye` du journal.

**Tester sans envoyer à de vraies personnes.** SES fournit des adresses de simulation, qui ne comptent pas dans votre taux de rebonds :

- `success@simulator.amazonses.com` : le message est « délivré » ;
- `bounce@simulator.amazonses.com` : un rebond définitif. Après quelques secondes, l'adresse est marquée injoignable, et **réserver de nouveau avec elle est refusé** ;
- `complaint@simulator.amazonses.com` : une plainte, avec le même effet.

**Les rappels** utilisent `site_des_rappels` (dans `main.tf`) pour construire le lien de gestion. En préproduction, c'est l'aperçu de la branche en cours d'essai.

**Si un e-mail ne part pas**, l'alarme `preprod-horsfiltre-api-courriels-en-echec` prévient l'équipe à l'adresse des alertes SES, et la ligne `courriel_echec` du journal de la fonction donne le type de message, le nom de l'erreur, le statut HTTP et le message d'AWS (qui nomme l'action, la ressource refusée et, souvent, la raison). Chaque adresse citée y perd sa partie locale (`***@gmail.com`).

## Retirer cette préproduction

Quand le compte `horsfiltre-preprod` existe : y recréer les mêmes ressources, basculer, puis ici `terraform destroy`. Aucune protection contre la suppression n'est active.
