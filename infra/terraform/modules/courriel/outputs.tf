output "enregistrements_dns" {
  description = "Enregistrements à ajouter dans la zone DNS du domaine, à la main, dans Cloudflare. Les trois CNAME doivent rester en « DNS uniquement » (nuage gris)."
  value = concat(
    [
      for jeton in aws_sesv2_email_identity.domaine.dkim_signing_attributes[0].tokens : {
        type   = "CNAME"
        nom    = "${jeton}._domainkey.${var.domaine}"
        valeur = "${jeton}.dkim.amazonses.com"
      }
    ],
    [
      {
        type     = "MX"
        nom      = local.domaine_retour
        valeur   = "feedback-smtp.${var.region}.amazonses.com"
        priorite = 10
      },
      {
        type   = "TXT"
        nom    = local.domaine_retour
        valeur = "v=spf1 include:amazonses.com ~all"
      },
    ]
  )
}

output "ensemble_configuration" {
  description = "Nom de l'ensemble de configuration, à indiquer à chaque envoi."
  value       = aws_sesv2_configuration_set.transactionnel.configuration_set_name
}

output "sujet_alertes_arn" {
  description = "Sujet SNS qui reçoit les alertes de réputation."
  value       = aws_sns_topic.alertes.arn
}
