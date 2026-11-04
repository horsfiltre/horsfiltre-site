variable "prefixe" {
  description = "Préfixe des noms : « preprod- » pour la préproduction provisoire, vide pour la production."
  type        = string
  default     = ""
}

variable "region" {
  description = "Région AWS du pool. Elle sert à écrire l'adresse de l'émetteur des jetons."
  type        = string
  default     = "eu-west-3"
}

variable "domaine_connexion" {
  description = "Préfixe de l'adresse de la page de connexion (https://<préfixe>.auth.<région>.amazoncognito.com). Unique dans la région, en minuscules, sans les mots aws, amazon ni cognito."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$", var.domaine_connexion)) && !can(regex("aws|amazon|cognito", var.domaine_connexion))
    error_message = "Le préfixe du domaine : 3 à 40 caractères, minuscules, chiffres et tirets, sans « aws », « amazon » ni « cognito »."
  }
}

variable "urls_retour" {
  description = "Adresses vers lesquelles Cognito renvoie l'administrateur après la connexion. Toute autre adresse est refusée."
  type        = list(string)
}

variable "urls_deconnexion" {
  description = "Adresses autorisées après la déconnexion."
  type        = list(string)
}

variable "protection_suppression" {
  description = "Empêche la suppression du pool, et donc la perte des quatre comptes. À laisser actif en production."
  type        = bool
  default     = true
}
