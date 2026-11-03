# Domaine d'envoi des e-mails transactionnels (confirmations, rappels, annulations).
# Engagements pris auprès d'AWS dans la demande de sortie du mode d'essai (docs/operations/ses-sortie-mode-essai.md) :
# liste de suppression au niveau du compte, événements publiés sur EventBridge, alarmes à 2 % et 0,05 %.

locals {
  domaine_retour = "${var.sous_domaine_retour}.${var.domaine}"
}

# ---------------------------------------------------------------------------------------------
# Ensemble de configuration : appliqué par défaut à tout envoi depuis le domaine.
# ---------------------------------------------------------------------------------------------

resource "aws_sesv2_configuration_set" "transactionnel" {
  configuration_set_name = var.nom_ensemble

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  # Une adresse qui rebondit ou se plaint n'est plus jamais écrite.
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

# Même règle au niveau du compte : elle vaut pour tout envoi, ensemble de configuration ou non.
resource "aws_sesv2_account_suppression_attributes" "compte" {
  suppressed_reasons = ["BOUNCE", "COMPLAINT"]
}

# ---------------------------------------------------------------------------------------------
# Identité du domaine : signature DKIM (Easy DKIM, clé de 2048 bits) et adresse de retour dédiée.
# ---------------------------------------------------------------------------------------------

resource "aws_sesv2_email_identity" "domaine" {
  email_identity         = var.domaine
  configuration_set_name = aws_sesv2_configuration_set.transactionnel.configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "retour" {
  email_identity   = aws_sesv2_email_identity.domaine.email_identity
  mail_from_domain = local.domaine_retour

  # Tant que l'enregistrement MX n'est pas en place, SES utilise son adresse de retour par défaut
  # au lieu de refuser l'envoi.
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

# ---------------------------------------------------------------------------------------------
# Événements de livraison : rebonds, plaintes et livraisons sont publiés sur le bus par défaut.
# La fonction qui marque une adresse comme injoignable sera ajoutée avec l'API (lot 6).
# ---------------------------------------------------------------------------------------------

data "aws_cloudwatch_event_bus" "defaut" {
  name = "default"
}

resource "aws_sesv2_configuration_set_event_destination" "evenements" {
  configuration_set_name = aws_sesv2_configuration_set.transactionnel.configuration_set_name
  event_destination_name = "evenements-eventbridge"

  event_destination {
    enabled              = true
    matching_event_types = ["BOUNCE", "COMPLAINT", "DELIVERY"]

    event_bridge_destination {
      event_bus_arn = data.aws_cloudwatch_event_bus.defaut.arn
    }
  }
}

# ---------------------------------------------------------------------------------------------
# Alertes de réputation, bien avant les seuils d'AWS.
# ---------------------------------------------------------------------------------------------

resource "aws_sns_topic" "alertes" {
  name = "horsfiltre-alertes-courriel"
}

resource "aws_sns_topic_subscription" "equipe" {
  topic_arn = aws_sns_topic.alertes.arn
  protocol  = "email"
  endpoint  = var.adresse_alertes
}

resource "aws_cloudwatch_metric_alarm" "rebonds" {
  alarm_name          = "horsfiltre-ses-taux-de-rebonds"
  alarm_description   = "Le taux de rebonds des e-mails dépasse le seuil d'alerte."
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = var.seuil_rebonds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertes.arn]
  ok_actions          = [aws_sns_topic.alertes.arn]
}

resource "aws_cloudwatch_metric_alarm" "plaintes" {
  alarm_name          = "horsfiltre-ses-taux-de-plaintes"
  alarm_description   = "Le taux de plaintes des e-mails dépasse le seuil d'alerte."
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  threshold           = var.seuil_plaintes
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alertes.arn]
  ok_actions          = [aws_sns_topic.alertes.arn]
}
