# Préproduction PROVISOIRE (ADR-0008) : données, identité des administrateurs et API, dans le compte de production,
# avec le préfixe « preprod- ». Elle ne contient que des données d'essai.

locals {
  # Interface d'administration : un projet Cloudflare Pages distinct (ADR-0005). Le nom du projet fixe son adresse ;
  # s'il change, ces trois lignes changent avec lui.
  administration_pages = "horsfiltre-admin.pages.dev"
}

module "donnees" {
  source = "../../modules/donnees"

  prefixe = "preprod-"

  # Une préproduction ne contient que des données d'essai : elle doit pouvoir se retirer sans étape de plus.
  protection_suppression = false
}

module "identite" {
  source = "../../modules/identite"

  prefixe           = "preprod-"
  domaine_connexion = "horsfiltre-admin-preprod"

  # `localhost:8788` sert à l'outil de test (api/scripts/appeler-administration.mts) et au développement local de l'interface.
  urls_retour      = ["https://${local.administration_pages}/connexion", "http://localhost:8788/connexion"]
  urls_deconnexion = ["https://${local.administration_pages}/", "http://localhost:8788/"]

  protection_suppression = false
}

module "api" {
  source = "../../modules/api"

  prefixe = "preprod-"
  archive = "${path.root}/../../../../dist/api.zip"

  nom_table = module.donnees.nom_table
  arn_table = module.donnees.arn_table

  # Aperçus du site public (previews Cloudflare Pages), et interface d'administration et ses aperçus.
  origines_publiques      = ["https://*.horsfiltre.pages.dev"]
  origines_administration = ["https://${local.administration_pages}", "https://*.${local.administration_pages}"]

  # Les aperçus ont des noms d'hôte variables : pas de contrôle du nom d'hôte du jeton Turnstile en préproduction.
  hotes_turnstile = []

  param_secret_jeton     = "/horsfiltre/preprod/jeton-secret"
  param_secret_turnstile = "/horsfiltre/preprod/turnstile-secret"

  emetteur  = module.identite.emetteur
  id_client = module.identite.id_client
}
