output "adresse" {
  description = "Adresse de l'API. Pour la préproduction, c'est l'adresse fournie par API Gateway : aucun nom de domaine n'est nécessaire."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "nom_fonction" {
  value = aws_lambda_function.api.function_name
}

output "groupe_journaux_fonction" {
  value = aws_cloudwatch_log_group.fonction.name
}

output "fonctions_courriel" {
  description = "Les fonctions des rappels et des retours, vides tant que les e-mails sont désactivés."
  value       = local.courriel ? { rappels = aws_lambda_function.rappels[0].function_name, retours = aws_lambda_function.retours[0].function_name } : {}
}
