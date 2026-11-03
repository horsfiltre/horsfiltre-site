# Production : amorçage de l'infrastructure.
#
# Versions épinglées exactement, avec la règle des 14 jours du dépôt :
# - Terraform 1.16.6, publiée le 14 octobre 2026 ;
# - fournisseur AWS 6.69.1, publiée le 15 octobre 2026.
# Le pipeline GitHub utilisera exactement les mêmes versions : Terraform refuse de lire un état
# écrit par une version plus récente que la sienne, même d'un cran de correctif.

terraform {
  required_version = "= 1.16.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.69.1"
    }
  }

  # L'état est dans le bucket créé à la main à l'amorçage (docs/operations/aws-organisation.md).
  # Le verrouillage est natif à S3 : aucune table DynamoDB (ADR-0003).
  # L'identité vient de l'environnement (AWS_PROFILE en local, OIDC dans le pipeline), jamais du code.
  backend "s3" {
    bucket       = "horsfiltre-tfstate-452473973922"
    key          = "amorcage/prod.tfstate"
    region       = "eu-west-3"
    encrypt      = true
    use_lockfile = true
  }
}
