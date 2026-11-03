# Préproduction PROVISOIRE, dans le compte de production (ADR-0008).
# Elle disparaît quand le compte horsfiltre-preprod existe : toutes ses ressources portent le préfixe « preprod- ».
#
# Versions épinglées exactement, avec la règle des 14 jours du dépôt :
# - Terraform 1.16.6, publiée le 14 octobre 2026 ;
# - fournisseur AWS 6.69.1, publiée le 15 octobre 2026.

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
    key          = "environnements/preprod.tfstate"
    region       = "eu-west-3"
    encrypt      = true
    use_lockfile = true
  }
}
