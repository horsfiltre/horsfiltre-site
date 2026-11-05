# E-mails : confirmation, report et annulation (envoyés par la fonction de l'API), rappels de la veille et d'une heure avant
# (fonction planifiée), et traitement des rebonds et des plaintes (fonction déclenchée par les événements de SES).
# Tout ce fichier est inactif quand `var.courriel` vaut null.

locals {
  courriel = var.courriel != null
  arn_ses = local.courriel ? [
    "arn:aws:ses:${var.region}:${data.aws_caller_identity.courant.account_id}:identity/${var.courriel.domaine}",
    "arn:aws:ses:${var.region}:${data.aws_caller_identity.courant.account_id}:configuration-set/${var.courriel.ensemble}",
  ] : []
  variables_courriel = local.courriel ? {
    EXPEDITEUR             = var.courriel.expediteur
    ENSEMBLE_CONFIGURATION = var.courriel.ensemble
    COPIE_INTERNE          = var.courriel.copie_interne
    URL_SITE               = var.courriel.url_site
  } : {}
}

data "aws_iam_policy_document" "approbation_lambda" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------------------------------------------------------------------------------------------- l'API envoie

# Envoyer, et rien d'autre : seulement depuis l'adresse prévue, avec l'identité et l'ensemble de configuration prévus.
# L'action est `ses:SendRawEmail`, et non `ses:SendEmail` : le code appelle SendEmail (API v2) avec un contenu BRUT
# (`Content.Raw`, imposé par le fichier d'agenda), et SES contrôle alors la permission d'envoi brut. Avec `ses:SendEmail`
# seul, chaque envoi est refusé (AccessDeniedException), alors que le simulateur IAM, interrogé sur ses:SendEmail, autorise.
resource "aws_iam_role_policy" "courriel_api" {
  count = local.courriel ? 1 : 0
  name  = "envoi-courriel"
  role  = aws_iam_role.fonction.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "EnvoyerDepuisLAdressePrevue"
      Effect    = "Allow"
      Action    = ["ses:SendRawEmail"]
      Resource  = local.arn_ses
      Condition = { StringEquals = { "ses:FromAddress" = var.courriel.expediteur } }
    }]
  })
}

# ---------------------------------------------------------------------------------------------- rappels (toutes les 5 minutes)

resource "aws_cloudwatch_log_group" "rappels" {
  count             = local.courriel ? 1 : 0
  name              = "/aws/lambda/${local.nom}-rappels"
  retention_in_days = var.retention_journaux_jours
}

resource "aws_iam_role" "rappels" {
  count              = local.courriel ? 1 : 0
  name               = "${local.nom}-rappels"
  assume_role_policy = data.aws_iam_policy_document.approbation_lambda.json
}

resource "aws_iam_role_policy" "rappels" {
  count = local.courriel ? 1 : 0
  name  = "acces-minimal"
  role  = aws_iam_role.rappels[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "Journaux", Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.rappels[0].arn}:*" },
      {
        # Lire (accompagnants, adresses injoignables, réservations par l'index des horaires) et réclamer un rappel (une écriture).
        Sid      = "Table"
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"]
        Resource = [var.arn_table, "${var.arn_table}/index/*"]
      },
      { Sid = "SecretDesLiens", Effect = "Allow", Action = ["ssm:GetParameters"], Resource = ["arn:aws:ssm:${var.region}:${data.aws_caller_identity.courant.account_id}:parameter${var.param_secret_jeton}"] },
      { Sid = "Envoyer", Effect = "Allow", Action = ["ses:SendRawEmail"], Resource = local.arn_ses, Condition = { StringEquals = { "ses:FromAddress" = var.courriel.expediteur } } },
    ]
  })
}

resource "aws_lambda_function" "rappels" {
  count         = local.courriel ? 1 : 0
  function_name = "${local.nom}-rappels"
  role          = aws_iam_role.rappels[0].arn

  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handlerRappels"

  filename         = var.archive
  source_code_hash = filebase64sha256(var.archive)
  memory_size      = 256
  timeout          = 60

  environment {
    variables = merge({ TABLE_NAME = var.nom_table, PARAM_SECRET_JETON = var.param_secret_jeton }, local.variables_courriel)
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.rappels[0].name
  }

  depends_on = [aws_iam_role_policy.rappels]
}

resource "aws_cloudwatch_event_rule" "rappels" {
  count               = local.courriel ? 1 : 0
  name                = "${local.nom}-rappels"
  description         = "Déclenche les rappels de la veille et d'une heure avant."
  schedule_expression = "rate(5 minutes)"
}

resource "aws_cloudwatch_event_target" "rappels" {
  count = local.courriel ? 1 : 0
  rule  = aws_cloudwatch_event_rule.rappels[0].name
  arn   = aws_lambda_function.rappels[0].arn
}

resource "aws_lambda_permission" "rappels" {
  count         = local.courriel ? 1 : 0
  statement_id  = "AutoriserEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rappels[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.rappels[0].arn
}

# ---------------------------------------------------------------------------------------------- rebonds et plaintes

resource "aws_cloudwatch_log_group" "retours" {
  count             = local.courriel ? 1 : 0
  name              = "/aws/lambda/${local.nom}-retours"
  retention_in_days = var.retention_journaux_jours
}

resource "aws_iam_role" "retours" {
  count              = local.courriel ? 1 : 0
  name               = "${local.nom}-retours"
  assume_role_policy = data.aws_iam_policy_document.approbation_lambda.json
}

resource "aws_iam_role_policy" "retours" {
  count = local.courriel ? 1 : 0
  name  = "acces-minimal"
  role  = aws_iam_role.retours[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "Journaux", Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.retours[0].arn}:*" },
      # Une seule écriture, jamais une lecture : marquer une adresse injoignable (son empreinte, pas l'adresse).
      { Sid = "MarquerInjoignable", Effect = "Allow", Action = ["dynamodb:PutItem"], Resource = [var.arn_table] },
    ]
  })
}

resource "aws_lambda_function" "retours" {
  count         = local.courriel ? 1 : 0
  function_name = "${local.nom}-retours"
  role          = aws_iam_role.retours[0].arn

  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "index.handlerRetours"

  filename         = var.archive
  source_code_hash = filebase64sha256(var.archive)
  memory_size      = 128
  timeout          = 10

  environment {
    variables = { TABLE_NAME = var.nom_table }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.retours[0].name
  }

  depends_on = [aws_iam_role_policy.retours]
}

# Les rebonds définitifs et les plaintes, publiés par l'ensemble de configuration sur le bus par défaut.
resource "aws_cloudwatch_event_rule" "retours" {
  count         = local.courriel ? 1 : 0
  name          = "${local.nom}-retours"
  description   = "Rebonds définitifs et plaintes publiés par SES."
  event_pattern = jsonencode({ source = ["aws.ses"], detail = { eventType = ["Bounce", "Complaint"] } })
}

resource "aws_cloudwatch_event_target" "retours" {
  count = local.courriel ? 1 : 0
  rule  = aws_cloudwatch_event_rule.retours[0].name
  arn   = aws_lambda_function.retours[0].arn
}

resource "aws_lambda_permission" "retours" {
  count         = local.courriel ? 1 : 0
  statement_id  = "AutoriserEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.retours[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.retours[0].arn
}

# ---------------------------------------------------------------------------------------------- alarmes

# Un e-mail qui n'est pas parti ne se voit pas, et la personne n'a alors jamais son lien : l'équipe est prévenue.
# Le motif est un simple mot, qui marche quel que soit le format de journal de Lambda.
resource "aws_cloudwatch_log_metric_filter" "courriel_echec_api" {
  count          = local.courriel ? 1 : 0
  name           = "${local.nom}-courriel-echec"
  log_group_name = aws_cloudwatch_log_group.fonction.name
  pattern        = "\"courriel_echec\""

  metric_transformation {
    name      = "CourrielsEnEchec"
    namespace = "Horsfiltre/${local.nom}"
    value     = "1"
  }
}

resource "aws_cloudwatch_log_metric_filter" "courriel_echec_rappels" {
  count          = local.courriel ? 1 : 0
  name           = "${local.nom}-rappels-courriel-echec"
  log_group_name = aws_cloudwatch_log_group.rappels[0].name
  pattern        = "\"courriel_echec\""

  metric_transformation {
    name      = "CourrielsEnEchec"
    namespace = "Horsfiltre/${local.nom}"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "courriel_echec" {
  count               = local.courriel ? 1 : 0
  alarm_name          = "${local.nom}-courriels-en-echec"
  alarm_description   = "Au moins un e-mail (confirmation, rappel, annulation) n'a pas pu partir."
  namespace           = "Horsfiltre/${local.nom}"
  metric_name         = "CourrielsEnEchec"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.courriel.arn_alertes]
  ok_actions          = [var.courriel.arn_alertes]
}

# Une fonction qui plante (configuration, accès) n'écrit parfois aucune ligne de journal utile : on surveille aussi ses erreurs.
resource "aws_cloudwatch_metric_alarm" "erreurs_taches" {
  for_each            = local.courriel ? { rappels = aws_lambda_function.rappels[0].function_name, retours = aws_lambda_function.retours[0].function_name } : {}
  alarm_name          = "${local.nom}-${each.key}-erreurs"
  alarm_description   = "La fonction ${each.key} a échoué."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = each.value }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.courriel.arn_alertes]
}
