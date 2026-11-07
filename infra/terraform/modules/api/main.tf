# API de réservation : une fonction Lambda derrière une API Gateway HTTP (ADR-0003, ADR-0004).
# Les routes publiques sont ouvertes ; les routes d'administration passent par l'autorisation JWT d'API Gateway, reliée au
# pool Cognito des administrateurs, et la fonction vérifie en plus l'appartenance au groupe « administrateurs » (ADR-0005).

data "aws_caller_identity" "courant" {}

locals {
  nom = "${var.prefixe}horsfiltre-api"

  # Routes ouvertes à tous. Chacune est écrite explicitement : une route oubliée n'existe tout simplement pas.
  routes_publiques = toset([
    "GET /v1/creneaux",
    "POST /v1/reservations",
    "GET /v1/reservations/{id}",
    "POST /v1/reservations/{id}/annulation",
    "POST /v1/reservations/{id}/report",
  ])

  # Une route par méthode, et non « ANY » : la requête préalable (OPTIONS) d'un navigateur ne porte pas de jeton et ne doit
  # pas être arrêtée par l'autorisation. Elle a sa propre route, ouverte, que la fonction traite.
  methodes_administration = toset(["GET", "POST", "PUT", "PATCH", "DELETE"])

  arn_parametres = [
    "arn:aws:ssm:${var.region}:${data.aws_caller_identity.courant.account_id}:parameter${var.param_secret_jeton}",
    "arn:aws:ssm:${var.region}:${data.aws_caller_identity.courant.account_id}:parameter${var.param_secret_turnstile}",
  ]
}

# ---------------------------------------------------------------------------------------------- journaux

resource "aws_cloudwatch_log_group" "fonction" {
  name              = "/aws/lambda/${local.nom}"
  retention_in_days = var.retention_journaux_jours
}

resource "aws_cloudwatch_log_group" "acces" {
  name              = "/aws/apigateway/${local.nom}"
  retention_in_days = var.retention_journaux_jours
}

# ---------------------------------------------------------------------------------------------- droits de la fonction

resource "aws_iam_role" "fonction" {
  name = local.nom

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Droits minimaux : écrire ses propres journaux, lire et écrire la table de données (et ses index), lire ses deux secrets.
# Rien d'autre : pas d'envoi d'e-mail, pas d'accès à un autre service, pas d'accès à une autre table.
resource "aws_iam_role_policy" "fonction" {
  name = "acces-minimal"
  role = aws_iam_role.fonction.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Journaux"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.fonction.arn}:*"
      },
      {
        # Les transactions (réserver, annuler, reporter) n'ont pas d'action propre : elles s'appuient sur ces quatre.
        Sid      = "Table"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query"]
        Resource = [var.arn_table, "${var.arn_table}/index/*"]
      },
      {
        Sid      = "Secrets"
        Effect   = "Allow"
        Action   = ["ssm:GetParameters"]
        Resource = local.arn_parametres
      },
    ]
  })
}

# ---------------------------------------------------------------------------------------------- fonction

resource "aws_lambda_function" "api" {
  function_name = local.nom
  role          = aws_iam_role.fonction.arn

  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handler"

  filename         = var.archive
  source_code_hash = filebase64sha256(var.archive)

  memory_size = var.memoire_mo
  timeout     = var.delai_secondes

  environment {
    variables = merge({
      TABLE_NAME              = var.nom_table
      ORIGINES_PUBLIQUES      = join(",", var.origines_publiques)
      ORIGINES_ADMINISTRATION = join(",", var.origines_administration)
      PARAM_SECRET_JETON      = var.param_secret_jeton
      PARAM_SECRET_TURNSTILE  = var.param_secret_turnstile
      TURNSTILE_HOTES         = join(",", var.hotes_turnstile)
    }, local.variables_courriel)
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.fonction.name
  }

  depends_on = [aws_iam_role_policy.fonction]
}

# ---------------------------------------------------------------------------------------------- passerelle

# Pas de configuration CORS ici : la fonction répond elle-même aux requêtes préalables, avec des origines distinctes
# pour le site public et pour l'administration.
resource "aws_apigatewayv2_api" "api" {
  name          = local.nom
  protocol_type = "HTTP"

  # Une fois le nom de domaine actif, l'adresse fournie par API Gateway est fermée : tout passe par Cloudflare (ADR-0003).
  disable_execute_api_endpoint = local.domaine_actif
}

resource "aws_apigatewayv2_integration" "fonction" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = var.delai_secondes * 1000
}

resource "aws_apigatewayv2_authorizer" "administration" {
  api_id           = aws_apigatewayv2_api.api.id
  name             = "${var.prefixe}cognito-administration"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [var.id_client]
    issuer   = var.emetteur
  }
}

resource "aws_apigatewayv2_route" "publiques" {
  for_each  = local.routes_publiques
  api_id    = aws_apigatewayv2_api.api.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.fonction.id}"
}

# Requête préalable des navigateurs, pour toutes les routes : sans jeton, traitée par la fonction.
resource "aws_apigatewayv2_route" "prealable" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "OPTIONS /v1/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.fonction.id}"
}

resource "aws_apigatewayv2_route" "administration" {
  for_each           = local.methodes_administration
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "${each.value} /v1/admin/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.fonction.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.administration.id
}

resource "aws_apigatewayv2_stage" "defaut" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.debit_par_defaut
    throttling_burst_limit = var.rafale_par_defaut
  }

  # La création d'une réservation est la route la plus exposée aux abus : limite plus stricte.
  route_settings {
    route_key              = "POST /v1/reservations"
    throttling_rate_limit  = var.debit_reservation
    throttling_burst_limit = var.rafale_reservation
  }

  # Journal d'accès sans adresse IP, sans en-tête et sans corps : seulement ce qui sert à diagnostiquer.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.acces.arn
    format = jsonencode({
      requestId          = "$context.requestId"
      route              = "$context.routeKey"
      status             = "$context.status"
      latenceMs          = "$context.responseLatency"
      statutIntegration  = "$context.integration.status"
      erreurAutorisation = "$context.authorizer.error"
    })
  }

  depends_on = [aws_apigatewayv2_route.publiques, aws_apigatewayv2_route.prealable, aws_apigatewayv2_route.administration]
}

resource "aws_lambda_permission" "passerelle" {
  statement_id  = "AutoriserLaPasserelle"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
