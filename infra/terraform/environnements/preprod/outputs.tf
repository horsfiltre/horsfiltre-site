output "nom_table" {
  value = module.donnees.nom_table
}

output "arn_table" {
  value = module.donnees.arn_table
}

output "adresse_api" {
  description = "Adresse de l'API de préproduction."
  value       = module.api.adresse
}

output "id_pool" {
  description = "Identifiant du pool Cognito, pour créer les comptes des administrateurs."
  value       = module.identite.id_pool
}

output "id_client" {
  description = "Identifiant du client Cognito de l'interface d'administration."
  value       = module.identite.id_client
}

output "adresse_connexion" {
  description = "Adresse de la page de connexion hébergée par Cognito."
  value       = module.identite.adresse_connexion
}

output "groupe_journaux_fonction" {
  value = module.api.groupe_journaux_fonction
}
