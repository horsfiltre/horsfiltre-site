output "id_pool" {
  description = "Identifiant du pool, pour créer les comptes des administrateurs."
  value       = aws_cognito_user_pool.administrateurs.id
}

output "id_client" {
  description = "Identifiant du client de l'interface d'administration."
  value       = aws_cognito_user_pool_client.administration.id
}

output "emetteur" {
  description = "Émetteur des jetons : API Gateway n'accepte que des jetons signés par ce pool."
  value       = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.administrateurs.id}"
}

output "adresse_connexion" {
  description = "Adresse de la page de connexion hébergée."
  value       = "https://${aws_cognito_user_pool_domain.connexion.domain}.auth.${var.region}.amazoncognito.com"
}
