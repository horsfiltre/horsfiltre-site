# Table unique de la plateforme (document d'architecture v1.0, chapitre 8) : créneaux, règles de disponibilité,
# absences et réservations du premier échange. Le détail des clés et des schémas d'accès est dans
# docs/api/modele-de-donnees.md. La table ne contient aucune donnée tant que l'API ne l'écrit pas.

resource "aws_dynamodb_table" "principale" {
  name         = "${var.prefixe}horsfiltre"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI2PK"
    type = "S"
  }
  attribute {
    name = "GSI2SK"
    type = "S"
  }
  attribute {
    name = "GSI3PK"
    type = "S"
  }
  attribute {
    name = "GSI3SK"
    type = "S"
  }
  attribute {
    name = "GSI5PK"
    type = "S"
  }

  # GSI2 : créneaux par statut et par date de début, réservations par statut et par date de début.
  global_secondary_index {
    name            = "GSI2"
    projection_type = "ALL"

    key_schema {
      attribute_name = "GSI2PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "GSI2SK"
      key_type       = "RANGE"
    }
  }

  # GSI3 : réservations actives d'une adresse e-mail. Index « creux » : une réservation annulée en sort.
  global_secondary_index {
    name            = "GSI3"
    projection_type = "ALL"

    key_schema {
      attribute_name = "GSI3PK"
      key_type       = "HASH"
    }
    key_schema {
      attribute_name = "GSI3SK"
      key_type       = "RANGE"
    }
  }

  # GSI5 : retrouver un créneau à partir de son identifiant, que le visiteur transmet. Il ne porte que les clés.
  global_secondary_index {
    name            = "GSI5"
    projection_type = "KEYS_ONLY"

    key_schema {
      attribute_name = "GSI5PK"
      key_type       = "HASH"
    }
  }

  # Suppression automatique des données personnelles à l'échéance (RGPD) : l'API écrit `expireLe`, en secondes.
  ttl {
    attribute_name = "expireLe"
    enabled        = true
  }

  point_in_time_recovery {
    enabled                 = true
    recovery_period_in_days = var.retention_sauvegardes_jours
  }

  deletion_protection_enabled = var.protection_suppression
}
