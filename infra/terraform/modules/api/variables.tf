variable "prefixe" {
  description = "Préfixe des noms : « preprod- » pour la préproduction provisoire, vide pour la production."
  type        = string
  default     = ""
}

variable "region" {
  description = "Région AWS de l'API."
  type        = string
  default     = "eu-west-3"
}

variable "archive" {
  description = "Chemin de l'archive de la fonction, construite par `npm run construire:api` (dist/api.zip)."
  type        = string
}

variable "nom_table" {
  description = "Nom de la table DynamoDB."
  type        = string
}

variable "arn_table" {
  description = "ARN de la table DynamoDB : la fonction n'a de droits que sur elle et sur ses index."
  type        = string
}

variable "origines_publiques" {
  description = "Origines autorisées à appeler les routes publiques depuis un navigateur. `https://*.exemple.fr` désigne un sous-domaine."
  type        = list(string)
}

variable "origines_administration" {
  description = "Origines autorisées à appeler les routes d'administration depuis un navigateur."
  type        = list(string)
}

variable "hotes_turnstile" {
  description = "Noms d'hôte sur lesquels le widget Turnstile peut s'afficher. Vide : pas de contrôle (préproduction)."
  type        = list(string)
  default     = []
}

variable "param_secret_jeton" {
  description = "Nom du paramètre qui porte le secret de signature des liens d'annulation. Il se crée À LA MAIN : un secret ne passe jamais par Terraform."
  type        = string
}

variable "param_secret_turnstile" {
  description = "Nom du paramètre qui porte la clé secrète Turnstile. Il se crée À LA MAIN."
  type        = string
}

variable "emetteur" {
  description = "Émetteur des jetons des administrateurs (sortie du module identité)."
  type        = string
}

variable "id_client" {
  description = "Client Cognito de l'interface d'administration : seuls ses jetons sont acceptés."
  type        = string
}

variable "memoire_mo" {
  description = "Mémoire de la fonction. Une fonction Lambda reçoit du processeur en proportion de sa mémoire."
  type        = number
  default     = 256
}

variable "delai_secondes" {
  description = "Durée maximale d'une exécution."
  type        = number
  default     = 10
}

variable "retention_journaux_jours" {
  description = "Durée de conservation des journaux. Ils ne contiennent aucune donnée personnelle."
  type        = number
  default     = 30
}

variable "debit_par_defaut" {
  description = "Requêtes par seconde autorisées sur l'ensemble de l'API."
  type        = number
  default     = 20
}

variable "rafale_par_defaut" {
  description = "Rafale autorisée sur l'ensemble de l'API."
  type        = number
  default     = 40
}

variable "debit_reservation" {
  description = "Requêtes par seconde autorisées pour la création d'une réservation : la route la plus exposée aux abus."
  type        = number
  default     = 2
}

variable "rafale_reservation" {
  description = "Rafale autorisée pour la création d'une réservation."
  type        = number
  default     = 5
}

variable "courriel" {
  description = <<-EOT
    Envoi des e-mails (confirmation, rappels, annulation). `null` : la réservation fonctionne, aucun e-mail ne part.
    L'identité SES (domaine) et l'ensemble de configuration existent déjà : ils sont créés par l'environnement `prod`.
  EOT
  type = object({
    expediteur    = string # adresse d'expédition, seule autorisée par la politique IAM
    domaine       = string # identité SES vérifiée
    ensemble      = string # ensemble de configuration : c'est lui qui publie les rebonds et les plaintes
    copie_interne = string # reçoit une copie de chaque réservation, annulation et report
    url_site      = string # site vers lequel pointent les rappels, par exemple https://horsfiltre.fr
    arn_alertes   = string # sujet SNS qui prévient l'équipe
  })
  default = null
}
