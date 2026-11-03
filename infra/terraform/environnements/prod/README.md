# Production : domaine d'envoi des e-mails

Crée dans `horsfiltre-prod` l'identité SES du domaine `horsfiltre.fr` (signature DKIM, adresse de retour `envoi.horsfiltre.fr`), l'ensemble de configuration, la liste de suppression, les événements vers EventBridge et les deux alarmes de réputation.

Il se lance **à la main, avec votre accès nominatif**, comme l'amorçage. Le pipeline ne l'appliquera qu'à partir du lot 6.

## Prérequis

- Terraform 1.16.6 et l'AWS CLI, profil `horsfiltre-prod`.
- Une session ouverte : `aws sso login --profile horsfiltre-prod`.
- Le fichier de verrouillage du fournisseur, copié de l'amorçage : les deux dossiers utilisent la même version.

```powershell
Copy-Item infra\terraform\amorcage\prod\.terraform.lock.hcl infra\terraform\environnements\prod\
```

## Commandes

```powershell
$env:AWS_PROFILE = "horsfiltre-prod"
cd infra\terraform\environnements\prod

terraform init
terraform validate
terraform plan -out courriel.tfplan
# relire le plan, puis seulement :
terraform apply courriel.tfplan
```

## Ce que le plan doit annoncer

Neuf ressources à créer, aucune à modifier ni à détruire, plus la lecture du bus d'événements, qui ne crée rien :
1. `aws_sesv2_configuration_set.transactionnel`
2. `aws_sesv2_account_suppression_attributes.compte`
3. `aws_sesv2_email_identity.domaine`
4. `aws_sesv2_email_identity_mail_from_attributes.retour`
5. `aws_sesv2_configuration_set_event_destination.evenements`
6. `aws_sns_topic.alertes`
7. `aws_sns_topic_subscription.equipe`
8. `aws_cloudwatch_metric_alarm.rebonds`
9. `aws_cloudwatch_metric_alarm.plaintes`

## Après l'apply

1. **Valider l'abonnement aux alertes** : AWS envoie un message à `contact@horsfiltre.fr`, avec un lien à ouvrir une fois.
2. **Ajouter les enregistrements DNS** dans Cloudflare : `terraform output enregistrements_dns`. Les trois CNAME restent en « DNS uniquement ».
3. **Contrôler la vérification** : `aws sesv2 get-email-identity --email-identity horsfiltre.fr`. Les deux statuts, de la signature DKIM et de l'adresse de retour, doivent passer à `SUCCESS`, ce qui peut prendre de quelques minutes à quelques heures.

## Ne jamais versionner

`.terraform/`, les fichiers `*.tfstate*` et `*.tfplan` : voir `.gitignore`.
