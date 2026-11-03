# Préproduction provisoire

Table de données de la préproduction, **dans le compte de production**, en attendant que le quota de comptes AWS permette de créer `horsfiltre-preprod` (ADR-0008). Toutes ses ressources portent le préfixe `preprod-` et l'étiquette `environnement = preprod`.

Elle ne contient que des données d'essai. **Aucune vraie donnée de candidat n'y est jamais écrite.**

## Commandes

```powershell
Copy-Item infra\terraform\amorcage\prod\.terraform.lock.hcl infra\terraform\environnements\preprod\
$env:AWS_PROFILE = "horsfiltre-prod"
cd infra\terraform\environnements\preprod

terraform init
terraform validate
terraform plan -out preprod.tfplan
# relire le plan, puis seulement :
terraform apply preprod.tfplan
```

## Ce que le plan doit annoncer

**Une seule ressource à créer**, aucune à modifier ni à détruire : `module.donnees.aws_dynamodb_table.principale`, nommée `preprod-horsfiltre`, avec trois index (`GSI2`, `GSI3`, `GSI5`), la restauration à un instant donné et la suppression automatique à l'échéance.

## Retirer cette préproduction

Quand le compte `horsfiltre-preprod` existe : y recréer les mêmes ressources, basculer, puis ici `terraform destroy`. La protection contre la suppression est désactivée, donc la commande fonctionne directement.
