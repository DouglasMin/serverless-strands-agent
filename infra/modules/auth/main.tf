# Cognito user pool acting purely as a federation broker for Google.
#
# There is no native password path: every user arrives through the Google IdP,
# so the pool holds no credentials and there is no signup/confirm/reset surface
# to build or secure. The `sub` claim it mints is the app's only user identity.

resource "aws_cognito_user_pool" "main" {
  name = var.name_prefix

  # Federated-only: Cognito never issues or verifies a password here, but the
  # pool still requires a policy block, so keep it maximally strict rather than
  # leaving the permissive default in place.
  password_policy {
    minimum_length                   = 99
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 1
  }

  # Nobody can self-register outside the Google flow.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 2048
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  user_pool_add_ons {
    advanced_security_mode = "AUDIT"
  }

  tags = {
    Project = var.name_prefix
  }
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  # `username` must map to Google's `sub`, not email — email is mutable on the
  # Google side and remapping it would silently hand one user another's pool
  # account.
  attribute_mapping = {
    username = "sub"
    email    = "email"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "spa" {
  name         = "${var.name_prefix}-spa"
  user_pool_id = aws_cognito_user_pool.main.id

  # Public client: no secret shipped to the browser. Cognito enforces PKCE for
  # public clients on the authorization-code flow.
  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = [aws_cognito_identity_provider.google.provider_name]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # No SRP / password flows — the hosted UI code exchange is the only path in.
  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  depends_on = [aws_cognito_identity_provider.google]
}
