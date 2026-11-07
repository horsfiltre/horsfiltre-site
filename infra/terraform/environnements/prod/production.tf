# La pile de PRODUCTION : données, identité des administrateurs et API, dans le compte horsfiltre-prod, sans préfixe.
# Les décisions viennent de l'ADR-0003 (Cloudflare et AWS, région de Paris) et de l'ADR-0005 (administration).
# La préproduction provisoire (ADR-0008) reste à côté, avec le préfixe « preprod- » : aucun nom ne se recoupe.
#
# Ordre de mise en place : voir PRODUCTION.md.

locals {
  # À passer à `true` UNIQUEMENT quand l'enregistrement DNS de validation est dans Cloudflare et que le certificat est émis
  # (voir PRODUCTION.md, étape 3). Tant que c'est `false`, le nom de domaine n'est pas créé.
  certificat_api_valide = true

  site           = "horsfiltre.fr"
  administration = "admin.horsfiltre.fr"
}

module "donnees" {
  source = "../../modules/donnees"

  prefixe = ""

  # Sauvegarde à un instant donné et protection contre la suppression : les réglages par défaut du module, voulus ici.
  protection_suppression = true
}

module "identite" {
  source = "../../modules/identite"

  prefixe           = ""
  domaine_connexion = "horsfiltre-admin"

  # L'interface vit sur son propre nom de domaine, derrière Cloudflare Access (ADR-0005). Aucune adresse `localhost` en production.
  urls_retour      = ["https://${local.administration}/"]
  urls_deconnexion = ["https://${local.administration}/"]

  protection_suppression = true
}

module "api" {
  source = "../../modules/api"

  prefixe = ""
  archive = "${path.root}/../../../../dist/api.zip"

  nom_table = module.donnees.nom_table
  arn_table = module.donnees.arn_table

  # Le site public, et lui seul : les aperçus de Cloudflare Pages n'ont rien à faire sur l'API de production.
  origines_publiques      = ["https://${local.site}", "https://www.${local.site}"]
  origines_administration = ["https://${local.administration}"]

  # En production, le jeton du contrôle anti-robot doit avoir été émis pour ces noms d'hôte, et eux seuls.
  hotes_turnstile = [local.site, "www.${local.site}"]

  param_secret_jeton     = "/horsfiltre/prod/jeton-secret"
  param_secret_turnstile = "/horsfiltre/prod/turnstile-secret"

  emetteur  = module.identite.emetteur
  id_client = module.identite.id_client

  courriel = {
    expediteur    = "contact@${local.site}"
    domaine       = local.site
    ensemble      = module.courriel.ensemble_configuration
    copie_interne = "contact@${local.site}"
    url_site      = "https://${local.site}"
    arn_alertes   = module.courriel.sujet_alertes_arn
  }

  domaine = {
    nom               = "api.${local.site}"
    certificat_valide = local.certificat_api_valide
  }
}

output "adresse_api" {
  description = "L'adresse que le site public appellera."
  value       = module.api.adresse_publique
}

output "validation_certificat_api" {
  description = "À ajouter dans Cloudflare en « DNS uniquement » (nuage gris) pour valider le certificat de l'API."
  value       = module.api.validation_certificat
}

output "cible_dns_api" {
  description = "Cible du CNAME « api » (avec le proxy Cloudflare activé). Vide tant que le certificat n'est pas validé."
  value       = module.api.cible_dns
}

output "nom_table" {
  value = module.donnees.nom_table
}

output "id_pool" {
  value = module.identite.id_pool
}

output "id_client" {
  value = module.identite.id_client
}

output "adresse_connexion" {
  value = module.identite.adresse_connexion
}

output "fonctions_courriel" {
  value = module.api.fonctions_courriel
}
