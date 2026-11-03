variable "prefixe" {
  description = "Préfixe du nom de la table. Il distingue la préproduction provisoire (« preprod- ») de la production (vide)."
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^([a-z0-9-]{1,20})?$", var.prefixe))
    error_message = "Le préfixe ne contient que des minuscules, des chiffres et des tirets, 20 caractères au plus."
  }
}

variable "protection_suppression" {
  description = "Empêche la suppression de la table. À laisser actif en production ; la préproduction provisoire le désactive pour pouvoir être retirée sans étape supplémentaire."
  type        = bool
  default     = true
}

variable "retention_sauvegardes_jours" {
  description = "Nombre de jours de restauration à un instant donné."
  type        = number
  default     = 35

  validation {
    condition     = var.retention_sauvegardes_jours >= 1 && var.retention_sauvegardes_jours <= 35
    error_message = "DynamoDB conserve entre 1 et 35 jours de sauvegardes continues."
  }
}
