module "donnees" {
  source = "../../modules/donnees"

  prefixe = "preprod-"

  # Une préproduction ne contient que des données d'essai : elle doit pouvoir se retirer sans étape de plus.
  protection_suppression = false
}
