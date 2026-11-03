# Le module ne fixe pas de version : c'est la racine qui épingle Terraform et le fournisseur AWS.
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}
