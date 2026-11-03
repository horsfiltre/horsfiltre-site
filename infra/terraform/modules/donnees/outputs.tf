output "nom_table" {
  description = "Nom de la table, à donner aux fonctions de l'API."
  value       = aws_dynamodb_table.principale.name
}

output "arn_table" {
  description = "ARN de la table, pour les droits des fonctions."
  value       = aws_dynamodb_table.principale.arn
}

output "arn_index" {
  description = "ARN des index, pour les droits de lecture."
  value       = "${aws_dynamodb_table.principale.arn}/index/*"
}
