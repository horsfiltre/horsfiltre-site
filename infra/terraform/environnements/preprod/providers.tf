provider "aws" {
  region = "eu-west-3"

  # Garde-fou : cette préproduction provisoire vit dans le compte de production, et nulle part ailleurs.
  allowed_account_ids = [var.compte_id]

  default_tags {
    tags = {
      projet        = "horsfiltre"
      environnement = "preprod"
      gere-par      = "terraform"
      dossier       = "infra/terraform/environnements/preprod"
    }
  }
}
