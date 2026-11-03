# Fédération avec GitHub Actions : le pipeline obtient des droits temporaires, sans aucune clé stockée.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# Seul le job lié à l'environnement GitHub « production » du dépôt peut endosser ce rôle.
# Cet environnement exige une validation manuelle d'un relecteur et la branche main.
# Aucune pull request, aucune autre branche, aucun autre dépôt n'y a accès.
data "aws_iam_policy_document" "approbation_deploiement" {
  statement {
    sid     = "GitHubActionsEnvironnementProduction"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.depot_github}:environment:${var.environnement_github}"]
    }
  }
}

resource "aws_iam_role" "deploiement" {
  name                 = "horsfiltre-github-deploiement"
  description          = "Rôle endossé par le job de déploiement GitHub Actions (environnement production)."
  assume_role_policy   = data.aws_iam_policy_document.approbation_deploiement.json
  max_session_duration = 3600
}

# Droits larges au départ, volontairement : le lot 6 crée l'API, les données et les e-mails, et nous
# ne connaissons pas encore la liste exacte des actions. Ils seront réduits d'après ce que le pipeline
# aura réellement utilisé (ADR-0004). Les refus ci-dessous, eux, s'appliquent dès maintenant.
resource "aws_iam_role_policy_attachment" "deploiement_droits" {
  role       = aws_iam_role.deploiement.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

data "aws_iam_policy_document" "garde_fous" {
  # Aucune clé permanente, aucun utilisateur IAM (décision ADR-0003).
  statement {
    sid    = "AucunIdentifiantPermanent"
    effect = "Deny"
    actions = [
      "iam:CreateUser",
      "iam:CreateAccessKey",
      "iam:CreateLoginProfile",
      "iam:UpdateLoginProfile",
      "iam:CreateServiceSpecificCredential",
    ]
    resources = ["*"]
  }

  # Le pipeline ne touche ni à l'organisation, ni à la facturation, ni au compte lui-même.
  statement {
    sid    = "AucuneActionSurLOrganisation"
    effect = "Deny"
    actions = [
      "organizations:*",
      "account:*",
      "billing:*",
      "budgets:*",
      "sso:*",
      "sso-directory:*",
      "identitystore:*",
    ]
    resources = ["*"]
  }

  # Le rôle de déploiement ne peut pas se modifier lui-même ni modifier la fédération :
  # tout changement passe par un humain, avec son accès nominatif.
  statement {
    sid    = "LeRoleNeSeModifiePasLuiMeme"
    effect = "Deny"
    actions = [
      "iam:DeleteRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePermissionsBoundary",
      "iam:DeleteRolePermissionsBoundary",
      "iam:UpdateRole",
    ]
    resources = [aws_iam_role.deploiement.arn]
  }

  statement {
    sid    = "LaFederationNeSeModifiePas"
    effect = "Deny"
    actions = [
      "iam:DeleteOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:AddClientIDToOpenIDConnectProvider",
      "iam:RemoveClientIDFromOpenIDConnectProvider",
    ]
    resources = [aws_iam_openid_connect_provider.github.arn]
  }

  # L'historique de l'état est protégé : on ne supprime ni le bucket, ni ses versions.
  # DeleteObject reste permis, car Terraform libère son verrou avec cette action.
  statement {
    sid    = "LEtatNeSEfface"
    effect = "Deny"
    actions = [
      "s3:DeleteBucket",
      "s3:PutBucketPolicy",
      "s3:DeleteBucketPolicy",
      "s3:PutBucketVersioning",
      "s3:DeleteObjectVersion",
    ]
    resources = [
      "arn:aws:s3:::${var.bucket_etat}",
      "arn:aws:s3:::${var.bucket_etat}/*",
    ]
  }

  # Les traces d'audit ne s'éteignent pas.
  statement {
    sid    = "LesTracesRestentActives"
    effect = "Deny"
    actions = [
      "cloudtrail:DeleteTrail",
      "cloudtrail:StopLogging",
      "cloudtrail:UpdateTrail",
      "cloudtrail:PutEventSelectors",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploiement_garde_fous" {
  name   = "garde-fous"
  role   = aws_iam_role.deploiement.id
  policy = data.aws_iam_policy_document.garde_fous.json
}
