variable "domaine" {
  description = "Domaine d'envoi des e-mails, celui de l'adresse expéditrice."
  type        = string
  default     = "horsfiltre.fr"
}

variable "sous_domaine_retour" {
  description = "Sous-domaine de l'adresse de retour (MAIL FROM personnalisé). Il porte les enregistrements MX et SPF propres à SES, sans toucher à la messagerie du domaine principal."
  type        = string
  default     = "envoi"
}

variable "region" {
  description = "Région AWS de SES. Elle détermine le nom du serveur qui reçoit les retours."
  type        = string
  default     = "eu-west-3"
}

variable "nom_ensemble" {
  description = "Nom de l'ensemble de configuration appliqué à tous les envois."
  type        = string
  default     = "horsfiltre-transactionnel"
}

variable "adresse_alertes" {
  description = "Adresse qui reçoit les alertes de réputation. AWS lui envoie un message de confirmation à valider une fois."
  type        = string
  default     = "contact@horsfiltre.fr"
}

variable "seuil_rebonds" {
  description = "Taux de rebonds au-delà duquel l'alarme se déclenche. 0,02 = 2 %. AWS surveille à partir de 5 %."
  type        = number
  default     = 0.02
}

variable "seuil_plaintes" {
  description = "Taux de plaintes au-delà duquel l'alarme se déclenche. 0,0005 = 0,05 %. AWS surveille à partir de 0,1 %."
  type        = number
  default     = 0.0005
}
