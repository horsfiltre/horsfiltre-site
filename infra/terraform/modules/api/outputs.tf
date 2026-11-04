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
