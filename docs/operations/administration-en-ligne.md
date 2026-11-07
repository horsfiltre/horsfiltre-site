# L'administration en ligne

L'interface d'administration (`admin/`) vit dans un **projet Cloudflare Pages distinct** du site public, sur `admin.horsfiltre.fr`, derrière **Cloudflare Access** (ADR-0005). Elle se connecte à l'API de production (`api.horsfiltre.fr`) avec un compte Cognito à double authentification : Access garde la porte, Cognito identifie la personne.

## Ce que fait le pipeline

À chaque fusion dans `main`, sous la même approbation que le site public :

1. `scripts/construire-admin.mjs --environnement production` fabrique `dist/admin` à partir de `admin/config.production.json` ;
2. `wrangler pages deploy dist/admin --project-name=horsfiltre-admin` le publie.

La construction **refuse** une configuration invalide et **refuse** tout résultat qui contiendrait `localhost`, `127.0.0.1`, `preprod`, `execute-api` ou l'ancien identifiant d'API de la préproduction. Elle fabrique aussi la politique de sécurité, qui ne laisse le navigateur parler qu'à l'API et à la page de connexion de la production. Elle est contrôlée dans chaque pull request, pas seulement au déploiement.

Pour changer une adresse (nouvelle API, nouveau client), modifier `admin/config.production.json` et rien d'autre : la politique suit.

## Mise en place, une seule fois, AVANT de fusionner ce lot

Le pipeline publie dans un projet qui doit déjà exister. Sans lui, l'étape de publication échoue à chaque fusion.

### 1. Créer le projet Pages

```powershell
npx.cmd wrangler login
npx.cmd wrangler pages project create horsfiltre-admin --production-branch=main
```

`wrangler login` ouvre le navigateur pour autoriser votre compte Cloudflare. Le jeton du pipeline (`CLOUDFLARE_API_TOKEN`) est un jeton de compte : il publie dans ce projet comme dans `horsfiltre`, sans autre réglage.

### 2. Le nom de domaine

Dans Cloudflare : Workers et Pages → `horsfiltre-admin` → Domaines personnalisés → ajouter `admin.horsfiltre.fr`. La zone est chez Cloudflare : l'enregistrement DNS se crée seul.

### 3. Cloudflare Access

Dans Zero Trust → Access → Applications → Ajouter une application → Auto-hébergée :

- domaines : `admin.horsfiltre.fr` **et** `horsfiltre-admin.pages.dev`, pour que l'adresse technique ne contourne pas la porte ;
- une politique « Autoriser », par adresses e-mail : celles des personnes de l'équipe, et seulement elles ;
- méthode de connexion : code à usage unique envoyé par e-mail ;
- durée de session : 8 heures.

Le code JavaScript de l'interface n'est pas un secret : la protection des données est celle de l'API (jeton Cognito, groupe `administrateurs`). Access ajoute une porte avant même d'afficher l'écran de connexion.

## Le compte administrateur

Dans le pool de production (`terraform output id_pool` dans `environnements/prod`). Remplacer `<adresse>` par l'adresse e-mail de la personne :

```powershell
aws cognito-idp admin-create-user --user-pool-id <id_pool> --username <adresse> --user-attributes Name=email,Value=<adresse> Name=email_verified,Value=true --desired-delivery-mediums EMAIL --region eu-west-3
aws cognito-idp admin-add-user-to-group --user-pool-id <id_pool> --username <adresse> --group-name administrateurs --region eu-west-3
```

Un mot de passe temporaire arrive par e-mail. À la première connexion, l'interface demande un nouveau mot de passe (14 caractères au moins) puis l'enregistrement d'une application d'authentification : **la double authentification est obligatoire** (ADR-0005). Ranger le mot de passe dans le gestionnaire de mots de passe.

## Vérifier

1. `https://admin.horsfiltre.fr` demande d'abord le code Access, puis la page de connexion Cognito ;
2. après connexion, l'onglet Équipe liste les accompagnants de la production ;
3. la console du navigateur ne signale aucune violation de la politique de sécurité ;
4. `https://horsfiltre-admin.pages.dev` demande, lui aussi, le code Access.

## Retirer un accès

Retirer l'adresse de la politique Access **et** désactiver le compte Cognito :

```powershell
aws cognito-idp admin-disable-user --user-pool-id <id_pool> --username <adresse> --region eu-west-3
```
