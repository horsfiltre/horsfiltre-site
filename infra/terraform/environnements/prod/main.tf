module "courriel" {
  source = "../../modules/courriel"

  domaine             = "horsfiltre.fr"
  sous_domaine_retour = "envoi"
  region              = "eu-west-3"
  adresse_alertes     = "contact@horsfiltre.fr"
}
