provider "aws" {
  region = "eu-west-3"

  # Garde-fou : Terraform refuse de travailler sur un autre compte que la production.
  allowed_account_ids = [var.compte_id]

  default_tags {
    tags = {
      projet        = "horsfiltre"
      environnement = "prod"
      gere-par      = "terraform"
      dossier       = "infra/terraform/environnements/prod"
    }
  }
}
