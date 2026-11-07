# Nom de domaine de l'API (ADR-0003 : « API Gateway HTTP sur api.horsfiltre.fr, certificat régional »).
# Inactif quand `var.domaine` vaut null (la préproduction garde l'adresse fournie par API Gateway).
#
# Deux étapes, parce que le certificat doit être validé par un enregistrement DNS qu'un humain ajoute chez Cloudflare :
#   1. `certificat_valide = false` : le certificat est demandé, et la sortie `validation_certificat` donne l'enregistrement à ajouter ;
#   2. `certificat_valide = true`, une fois le certificat émis : le nom de domaine et son rattachement à l'API sont créés,
#      et le point d'entrée par défaut d'API Gateway est désactivé, de sorte que l'API ne soit joignable que par le nom de domaine.

variable "domaine" {
  description = "Nom de domaine de l'API. `null` : aucun nom de domaine, l'adresse fournie par API Gateway reste la seule."
  type = object({
    nom               = string # par exemple api.horsfiltre.fr
    certificat_valide = bool   # false tant que l'enregistrement de validation n'est pas dans le DNS et le certificat émis
  })
  default = null
}

locals {
  domaine       = var.domaine != null
  # `&&` n'arrête pas l'évaluation du second terme : sur null, il échouerait. D'où la condition.
  domaine_actif = var.domaine == null ? false : var.domaine.certificat_valide
}

resource "aws_acm_certificate" "api" {
  count             = local.domaine ? 1 : 0
  domain_name       = var.domaine.nom
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# N'existe qu'à l'étape 2. Si l'enregistrement DNS manque, l'application échoue après 15 minutes au lieu d'attendre 75.
resource "aws_acm_certificate_validation" "api" {
  count           = local.domaine_actif ? 1 : 0
  certificate_arn = aws_acm_certificate.api[0].arn

  timeouts {
    create = "15m"
  }
}

resource "aws_apigatewayv2_domain_name" "api" {
  count       = local.domaine_actif ? 1 : 0
  domain_name = var.domaine.nom

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api[0].certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api" {
  count       = local.domaine_actif ? 1 : 0
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.api[0].domain_name
  stage       = aws_apigatewayv2_stage.defaut.id
}

output "validation_certificat" {
  description = "Enregistrements DNS à ajouter à la main dans Cloudflare, en « DNS uniquement » (nuage gris), pour valider le certificat."
  value = local.domaine ? [
    for o in aws_acm_certificate.api[0].domain_validation_options : {
      type   = o.resource_record_type
      nom    = o.resource_record_name
      valeur = o.resource_record_value
    }
  ] : []
}

output "cible_dns" {
  description = "Cible de l'enregistrement CNAME du nom de domaine de l'API (à créer dans Cloudflare, avec le proxy activé). Vide avant l'étape 2."
  value       = local.domaine_actif ? aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].target_domain_name : null
}

output "adresse_publique" {
  description = "L'adresse que le site public doit appeler."
  value       = local.domaine_actif ? "https://${var.domaine.nom}" : aws_apigatewayv2_api.api.api_endpoint
}
