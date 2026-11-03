variable "compte_id" {
  description = "Identifiant du compte AWS de production."
  type        = string
  default     = "452473973922"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.compte_id))
    error_message = "L'identifiant d'un compte AWS comporte 12 chiffres."
  }
}
