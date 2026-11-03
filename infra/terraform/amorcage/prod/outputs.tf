output "role_deploiement_arn" {
  description = "Rôle que le pipeline endosse par OIDC. Ce n'est pas un secret : sans le jeton signé de GitHub, il est inutilisable."
  value       = aws_iam_role.deploiement.arn
}

output "fournisseur_oidc_arn" {
  description = "Fournisseur d'identité GitHub."
  value       = aws_iam_openid_connect_provider.github.arn
}
