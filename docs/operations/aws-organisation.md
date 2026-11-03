# Organisation AWS : amorçage

**À faire par l'équipe les 2 et 3 novembre 2026.** Terraform ne peut rien créer avant cette étape.

Ces opérations sont faites à la main dans la console : c'est l'une des exceptions d'amorçage décidées le 2 novembre (décision Q5). Tout ce qui suit sera en Terraform. Chaque étape se termine par ce qu'il faut me renvoyer.

Les libellés de la console AWS changent parfois : si un bouton ne correspond pas exactement, envoyez-moi une capture plutôt que de deviner.

## Ce que vous allez obtenir

```text
horsfiltre-org          compte de gestion : aucune application, seulement l'organisation, la facturation et les accès
├── horsfiltre-prod     compte membre (existant) : la production
└── horsfiltre-preprod  compte membre (nouveau) : la préproduction
```

## Avant de commencer

- Deux adresses dédiées, sur le modèle de celle de la production : `ilyas.laarif2024+aws-org@gmail.com` et `ilyas.laarif2024+aws-preprod@gmail.com`.
- Votre carte bancaire : la facturation de toute l'organisation passera par le compte de gestion.
- Votre téléphone, pour les seconds facteurs.

## Étape 1 — Créer le compte de gestion `horsfiltre-org`

1. Créez un compte AWS comme vous l'avez fait pour la production : adresse `ilyas.laarif2024+aws-org@gmail.com`, nom `horsfiltre-org`, **offre payante**, support **Basic**.
2. Dès la première connexion : une passkey et une application d'authentification sur le compte racine, **aucune clé d'accès**.
3. Dans **Budgets**, un budget mensuel à 1 $ avec alerte par e-mail. Une fois l'organisation créée, ce budget couvre la facture de tous les comptes.

## Étape 2 — Créer l'organisation

1. Dans `horsfiltre-org`, ouvrez **AWS Organizations**, puis **Create an organization**.
2. AWS envoie un e-mail de vérification à l'adresse du compte : validez-le.

## Étape 3 — Rattacher `horsfiltre-prod`

1. Dans `horsfiltre-org` : **AWS accounts**, **Add an AWS account**, **Invite an existing AWS account**, puis l'identifiant du compte de production, `452473973922`.
2. Connectez-vous à `horsfiltre-prod` en racine : **AWS Organizations**, **Invitations**, **Accept**.
3. Vérifiez dans `horsfiltre-org`, **Billing and Cost Management**, **Credits**, que les crédits de bienvenue du compte de production apparaissent toujours.

Ce que cela change : la facture de la production passe sur le compte de gestion. Le compte de production, ses ressources et son compte racine ne changent pas.

## Étape 4 — Créer `horsfiltre-preprod`

1. Dans `horsfiltre-org` : **Add an AWS account**, **Create an AWS account**. Nom `horsfiltre-preprod`, adresse `ilyas.laarif2024+aws-preprod@gmail.com`, rôle d'accès par défaut `OrganizationAccountAccessRole`.
2. Le compte racine d'un compte créé ainsi n'a pas de mot de passe. Sur la page de connexion racine, avec cette adresse, utilisez **Forgot password** pour en définir un, généré par Bitwarden.
3. Ajoutez une passkey et une application d'authentification. Aucune clé d'accès.

## Étape 5 — IAM Identity Center : vos accès au quotidien

Après cette étape, plus personne ne se connecte en racine pour travailler.

1. Dans `horsfiltre-org`, région **Europe (Paris)**, ouvrez **IAM Identity Center**, puis **Enable**.
2. **Settings**, **Authentication** : exigez un second facteur **à chaque connexion**, avec applications d'authentification et clés de sécurité ou passkeys autorisées.
3. **Users**, **Add user** : votre utilisateur, avec votre adresse habituelle. Les trois associés seront ajoutés plus tard, avec des droits plus restreints.
4. **Groups** : créez `administrateurs-plateforme`, et ajoutez-vous.
5. **Permission sets**, **Create permission set** : jeu prédéfini **AdministratorAccess**, nom `AdministrateurPlateforme`, durée de session de **4 heures**. Ces droits larges ne servent qu'à amorcer ; ils seront réduits quand Terraform aura créé les rôles de déploiement.
6. **AWS accounts** : cochez `horsfiltre-prod` et `horsfiltre-preprod`, **Assign users or groups**, groupe `administrateurs-plateforme`, jeu `AdministrateurPlateforme`.
7. Notez l'**adresse du portail d'accès**, de la forme `https://d-xxxxxxxxxx.awsapps.com/start`, et connectez-vous-y une première fois pour enregistrer votre second facteur.

## Étape 6 — Limiter l'organisation à la région de Paris

Une politique de contrôle des services interdit de créer quoi que ce soit hors de `eu-west-3`, sauf les services mondiaux qui n'ont pas de région.

1. Dans `horsfiltre-org`, **AWS Organizations**, **Policies**, **Service control policies**, **Enable service control policies**.
2. **Create policy**, nom `regions-autorisees`, puis collez :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RefuserHorsParis",
      "Effect": "Deny",
      "NotAction": [
        "account:*", "aws-portal:*", "billing:*", "budgets:*", "ce:*", "cur:*",
        "freetier:*", "invoicing:*", "payments:*", "tax:*", "pricing:*",
        "health:*", "iam:*", "organizations:*", "sts:*", "support:*", "trustedadvisor:*",
        "sso:*", "sso-directory:*", "identitystore:*",
        "s3:GetAccountPublic*", "s3:ListAllMyBuckets", "s3:PutAccountPublic*"
      ],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": { "aws:RequestedRegion": ["eu-west-3"] }
      }
    }
  ]
}
```

3. **Attach** la politique à la racine de l'organisation (**Root**). Elle s'applique aux deux comptes membres ; elle ne s'applique jamais au compte de gestion, c'est le fonctionnement normal d'AWS.
4. Vérification : connecté à la préproduction par le portail, choisissez la région **US East (N. Virginia)** et ouvrez Lambda. Un message d'accès refusé doit s'afficher.

## Étape 7 — Les buckets d'état de Terraform

Un bucket par compte membre, créé dans **CloudShell** (l'icône de terminal en haut de la console), donc sans aucune clé sur votre ordinateur. Faites-le dans `horsfiltre-preprod`, puis dans `horsfiltre-prod`, connecté par le portail d'accès, région Paris.

```bash
COMPTE=$(aws sts get-caller-identity --query Account --output text)
BUCKET="horsfiltre-tfstate-${COMPTE}"

aws s3api create-bucket --bucket "$BUCKET" --region eu-west-3 \
  --create-bucket-configuration LocationConstraint=eu-west-3
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}'
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\":\"2012-10-17\",
  \"Statement\":[{\"Sid\":\"TlsObligatoire\",\"Effect\":\"Deny\",\"Principal\":\"*\",\"Action\":\"s3:*\",
    \"Resource\":[\"arn:aws:s3:::${BUCKET}\",\"arn:aws:s3:::${BUCKET}/*\"],
    \"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"anciennes-versions","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":90}}]}'

echo "Bucket prêt : $BUCKET"
```

Terraform y posera aussi son verrou, sans table DynamoDB : c'est le verrouillage natif décidé par l'ADR-0003.

## Ce qu'il me faut en retour

- L'identifiant à 12 chiffres de `horsfiltre-org` et de `horsfiltre-preprod`.
- L'adresse du portail d'accès d'IAM Identity Center.
- Les deux noms de bucket affichés par CloudShell.
- La confirmation que la vérification de l'étape 6 a bien refusé l'accès.

Aucun de ces éléments n'est un secret : un identifiant de compte ou une adresse de portail ne permet pas de se connecter.
