# Amorçage de la production

Ce dossier crée, dans le compte `horsfiltre-prod`, ce qui permet à GitHub Actions de déployer sans aucune clé : le fournisseur d'identité de GitHub et le rôle `horsfiltre-github-deploiement`.

Il se lance **à la main, avec votre accès nominatif**, jamais depuis le pipeline : le rôle de déploiement ne peut pas se modifier lui-même (voir `github-oidc.tf`).

## Prérequis

- Terraform 1.16.6 et l'AWS CLI, profil `horsfiltre-prod` configuré (`aws configure sso`).
- Une session ouverte : `aws sso login --profile horsfiltre-prod`.

## Commandes

```powershell
$env:AWS_PROFILE = "horsfiltre-prod"
cd infra\terraform\amorcage\prod

terraform init
terraform validate
terraform plan -out amorcage.tfplan
# relire le plan, puis seulement :
terraform apply amorcage.tfplan
```

Après le premier `init`, verrouillez les fournisseurs pour Windows et Linux, puis versionnez `.terraform.lock.hcl` :

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```

## Ce que le plan doit annoncer

Quatre ressources à créer, aucune à modifier ni à détruire :
1. `aws_iam_openid_connect_provider.github`
2. `aws_iam_role.deploiement`
3. `aws_iam_role_policy_attachment.deploiement_droits`
4. `aws_iam_role_policy.deploiement_garde_fous`

Tout autre résultat se discute avant l'`apply`.

## Ne jamais versionner

`.terraform/`, les fichiers `*.tfstate*` et `*.tfplan` : voir `.gitignore`.
