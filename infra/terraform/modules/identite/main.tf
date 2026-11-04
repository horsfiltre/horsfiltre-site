# Pool Cognito réservé aux administrateurs (ADR-0005, option B) : aucune inscription libre, les comptes sont créés
# par l'équipe, la double authentification est OBLIGATOIRE et se règle pour tout le pool, pas seulement pour un groupe.

resource "aws_cognito_user_pool" "administrateurs" {
  name                = "${var.prefixe}horsfiltre-administrateurs"
  user_pool_tier      = "ESSENTIALS"
  deletion_protection = var.protection_suppression ? "ACTIVE" : "INACTIVE"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Second facteur : application d'authentification (TOTP). Imposé à chaque connexion, sans exception.
  mfa_configuration = "ON"
  software_token_mfa_configuration {
    enabled = true
  }

  password_policy {
    minimum_length                   = 14
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 3
  }

  # Les comptes ne se créent pas seuls : seule l'équipe en ajoute.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Une adresse modifiée doit être vérifiée avant de remplacer l'ancienne.
  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }
}

resource "aws_cognito_user_group" "administrateurs" {
  name         = "administrateurs"
  user_pool_id = aws_cognito_user_pool.administrateurs.id
  description  = "Membres de l'équipe autorisés à administrer les créneaux et les réservations."
}

# Page de connexion hébergée par Cognito (version classique), qui porte le formulaire et la double authentification.
resource "aws_cognito_user_pool_domain" "connexion" {
  domain                = var.domaine_connexion
  user_pool_id          = aws_cognito_user_pool.administrateurs.id
  managed_login_version = 1
}

# Client de l'interface d'administration : flux « authorization code » avec PKCE, sans secret (une page ne peut pas en garder un).
resource "aws_cognito_user_pool_client" "administration" {
  name         = "${var.prefixe}horsfiltre-administration"
  user_pool_id = aws_cognito_user_pool.administrateurs.id

  generate_secret                      = false
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.urls_retour
  logout_urls                          = var.urls_deconnexion

  # Jeton d'accès d'une heure, conservé en mémoire par l'interface. Session de huit heures au plus.
  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 8
  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "hours"
  }

  explicit_auth_flows           = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
}
