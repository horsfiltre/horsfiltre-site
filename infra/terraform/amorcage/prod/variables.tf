variable "compte_id" {
  description = "Identifiant du compte AWS de production."
  type        = string
  default     = "452473973922"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.compte_id))
    error_message = "L'identifiant d'un compte AWS comporte 12 chiffres."
  }
}

variable "depot_github" {
  description = "Dépôt GitHub autorisé à déployer, au format organisation/dépôt."
  type        = string
  default     = "horsfiltre/horsfiltre-site"
}

variable "environnement_github" {
  description = "Environnement GitHub dont le jeton OIDC est accepté. Il impose une validation manuelle et la branche main."
  type        = string
  default     = "production"
}

variable "bucket_etat" {
  description = "Bucket S3 qui contient l'état de Terraform."
  type        = string
  default     = "horsfiltre-tfstate-452473973922"
}
