# Préproduction PROVISOIRE (ADR-0008) : données, identité des administrateurs et API, dans le compte de production,
# avec le préfixe « preprod- ». Elle ne contient que des données d'essai.

locals {
  # Interface d'administration : un projet Cloudflare Pages distinct (ADR-0005). Le nom du projet fixe son adresse ;
  # s'il change, ces trois lignes changent avec lui.
  administration_pages = "horsfiltre-admin.pages.dev"
}

data "aws_caller_identity" "courant" {}

locals {
  # Site vers lequel pointent les liens des RAPPELS (un rappel n'est pas une réponse à une requête : il ne sait pas où la personne
  # a réservé). Les e-mails de confirmation, eux, renvoient vers le site où la personne a réservé. En préproduction, c'est l'aperçu
  # de la branche en cours d'essai ; il change avec elle. En production : https://horsfiltre.fr.
  site_des_rappels = "https://lot-9-courriels.horsfiltre.pages.dev"
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

  # L'interface revient à la racine du site. Les adresses `localhost:8788` ne servent qu'en préproduction : le développement
  # local de l'interface (npm run admin:dev) et l'outil de test (api/scripts/appeler-administration.mts, qui écoute /connexion).
  # À RETIRER dans la pile de production.
  urls_retour = [
    "https://${local.administration_pages}/",
    "http://localhost:8788/",
    "http://localhost:8788/connexion",
  ]
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
  # `http://localhost:8788` : l'interface lancée sur le poste d'un administrateur (npm run admin:dev). À RETIRER en production.
  origines_administration = ["https://${local.administration_pages}", "https://*.${local.administration_pages}", "http://localhost:8788"]

  # Les aperçus ont des noms d'hôte variables : pas de contrôle du nom d'hôte du jeton Turnstile en préproduction.
  hotes_turnstile = []

  param_secret_jeton     = "/horsfiltre/preprod/jeton-secret"
  param_secret_turnstile = "/horsfiltre/preprod/turnstile-secret"

  emetteur  = module.identite.emetteur
  id_client = module.identite.id_client

  # E-mails. L'identité SES (horsfiltre.fr), l'ensemble de configuration et le sujet d'alertes sont créés par l'environnement
  # `prod`, dans ce même compte : on les désigne par leur nom, sans lire son état.
  courriel = {
    expediteur    = "contact@horsfiltre.fr"
    domaine       = "horsfiltre.fr"
    ensemble      = "horsfiltre-transactionnel"
    copie_interne = "contact@horsfiltre.fr"
    url_site      = local.site_des_rappels
    arn_alertes   = "arn:aws:sns:eu-west-3:${data.aws_caller_identity.courant.account_id}:horsfiltre-alertes-courriel"
  }
}
