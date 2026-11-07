# Production : la pile de la plateforme

Le domaine d'envoi des e-mails est décrit dans `README.md`. Ce document décrit la pile de la plateforme.

Cet environnement contient deux choses, dans le compte `horsfiltre-prod` (région de Paris) :

- le **domaine d'envoi des e-mails** (`module.courriel`, déjà en place) ;
- la **pile de la plateforme** (`production.tf`) : table de données, identité des administrateurs, API et ses fonctions. Aucun préfixe : les noms ne recoupent pas ceux de la préproduction provisoire (`preprod-`, ADR-0008).

L'API est servie par `api.horsfiltre.fr`, derrière Cloudflare (ADR-0003). Le point d'entrée par défaut d'API Gateway est fermé une fois le nom de domaine actif.

## Ordre de mise en place

Chaque étape dépend de la précédente : ne pas en sauter.

### 0. Avant tout (à la main, hors Terraform)

**Le contrôle anti-robot.** Dans Cloudflare, Turnstile, créer un widget `horsfiltre-production` pour les noms d'hôte `horsfiltre.fr` et `www.horsfiltre.fr`. Noter la clé de site (publique) et la clé secrète.

**Les deux secrets**, dans le magasin de paramètres AWS. Rien ne s'écrit dans un fichier, un commit ou une conversation :

```powershell
$octets = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($octets)
$secret = [Convert]::ToBase64String($octets)
aws ssm put-parameter --name /horsfiltre/prod/jeton-secret --type SecureString --value $secret --region eu-west-3
Remove-Variable secret, octets

$t = Read-Host "Clé secrète Turnstile" -AsSecureString
$clair = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($t))
aws ssm put-parameter --name /horsfiltre/prod/turnstile-secret --type SecureString --value $clair --region eu-west-3
Remove-Variable t, clair
```

### 1. Construire et planifier

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run construire:api
cd infra\terraform\environnements\prod
terraform init
terraform validate
terraform plan -out prod.tfplan
```

Attendu : **uniquement des ajouts**, de l'ordre de 46, sur `module.donnees`, `module.identite` et `module.api` (dont un certificat). **Aucune modification ni destruction**, et rien sur `module.courriel`. Dans le cas contraire, ne pas appliquer.

### 2. Appliquer, puis valider le certificat

```powershell
terraform apply "prod.tfplan"
terraform output validation_certificat_api
```

Ajouter l'enregistrement affiché (type CNAME) dans la zone `horsfiltre.fr` de Cloudflare, en **« DNS uniquement » (nuage gris)**. Attendre l'émission, qui prend de quelques minutes à une heure :

```powershell
aws acm list-certificates --region eu-west-3 --query "CertificateSummaryList[?DomainName=='api.horsfiltre.fr'].[CertificateArn,Status]" --output text
```

### 3. Activer le nom de domaine

Seulement quand le statut est `ISSUED`. Dans `production.tf`, passer `certificat_api_valide` à `true`, puis :

```powershell
terraform plan -out prod.tfplan
terraform apply "prod.tfplan"
terraform output cible_dns_api
```

Attendu : **3 ajouts** (validation, nom de domaine, rattachement) et **1 modification** (l'API ferme son point d'entrée par défaut), 0 destruction. Laisser la valeur `true` dans le dépôt : l'y remettre à `false` détruirait le nom de domaine.

### 4. Pointer le nom de domaine

Dans Cloudflare : un enregistrement **CNAME `api`** vers la cible affichée, **proxy activé** (nuage orange). Vérifier que le mode SSL/TLS de la zone est **Full (strict)** : en « Flexible », Cloudflare parlerait à l'API en clair et elle refuserait.

```powershell
curl.exe -s -o NUL -w "%{http_code}\n" https://api.horsfiltre.fr/v1/creneaux
```

Attendu : `200`, avec une liste de créneaux vide. Un `500` veut dire que les secrets de l'étape 0 manquent ou sont trop courts.

### 5. Accompagnants et premier administrateur

Le fichier des accompagnants reste local (`docs/sources/accompagnants.txt`, ignoré par Git). Simulation d'abord, puis écriture :

```powershell
$env:TABLE_NAME = "horsfiltre"
node api\scripts\amorcer-accompagnants.mts --production
node api\scripts\amorcer-accompagnants.mts --production --appliquer
```

Le compte administrateur et son groupe se créent dans le pool affiché par `terraform output id_pool`. La double authentification est exigée à la première connexion (ADR-0005).

### 6. Ouvrir

Séparément, dans un lot à part : remplir `PRODUCTION` dans `public/assets/js/config.js` (`https://api.horsfiltre.fr` et la clé de site Turnstile). La page n'affiche plus « ouvre très bientôt » mais « complet », **tant qu'aucune règle de disponibilité n'existe**. L'ouverture réelle consiste à créer ces règles dans l'administration.

## Ce que cet environnement ne fait pas

- Il ne publie pas l'interface d'administration (projet Cloudflare Pages `admin.horsfiltre.fr` et Cloudflare Access).
- Il ne gère pas les enregistrements DNS : Cloudflare est modifié à la main, comme pour le domaine d'envoi.
- `protection_suppression` empêche de détruire la table et le pool par erreur : les retirer demande un geste explicite.
