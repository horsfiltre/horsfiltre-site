output "enregistrements_dns" {
  description = "Enregistrements à ajouter à la main dans Cloudflare."
  value       = module.courriel.enregistrements_dns
}

output "ensemble_configuration" {
  value = module.courriel.ensemble_configuration
}

output "sujet_alertes_arn" {
  value = module.courriel.sujet_alertes_arn
}
