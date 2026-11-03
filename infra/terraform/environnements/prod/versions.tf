# Production : ressources applicatives (domaine d'envoi des e-mails, puis API, données, planification).
# L'amorçage (rôle de déploiement GitHub) est dans ../../amorcage/prod et ne se mélange pas à ce dossier.
#
# Versions épinglées exactement, avec la règle des 14 jours du dépôt :
# - Terraform 1.16.6, publiée le 14 octobre 2026 ;
# - fournisseur AWS 6.69.1, publiée le 15 octobre 2026.
# Le pipeline GitHub utilisera exactement les mêmes versions.

terraform {
  required_version = "= 1.16.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.69.1"
    }
  }

  backend "s3" {
    bucket       = "horsfiltre-tfstate-452473973922"
    key          = "environnements/prod.tfstate"
    region       = "eu-west-3"
    encrypt      = true
    use_lockfile = true
  }
}
