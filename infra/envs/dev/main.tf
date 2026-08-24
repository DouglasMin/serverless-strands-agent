locals {
  name_prefix = "${var.project_name}-${var.env}"
}

module "data" {
  source = "../../modules/data"

  name_prefix      = local.name_prefix
  session_ttl_days = var.session_ttl_days
}

module "uploads" {
  source = "../../modules/uploads"

  name_prefix           = local.name_prefix
  allowed_origins       = [var.site_url, var.local_dev_url]
  upload_retention_days = 30
}

module "auth" {
  source = "../../modules/auth"

  name_prefix          = local.name_prefix
  domain_prefix        = var.cognito_domain_prefix
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret

  # Cognito matches redirect_uri exactly, so the SPA must send these strings
  # verbatim. Root path is used so no new SPA route is needed.
  callback_urls = ["${var.site_url}/", "${var.local_dev_url}/"]
  logout_urls   = ["${var.site_url}/", "${var.local_dev_url}/"]
}

module "backend" {
  source = "../../modules/backend"

  name_prefix        = local.name_prefix
  region             = var.region
  aws_profile        = var.aws_profile
  sessions_table_arn = module.data.sessions_table_arn
  sessions_table     = module.data.sessions_table_name
  uploads_bucket     = module.uploads.bucket_id
  uploads_bucket_arn = module.uploads.bucket_arn
  agent_runtime_arn  = var.agent_runtime_arn
  log_retention_days = var.log_retention_days
  lambda_source_dir  = "${path.module}/../../../backend"

  cognito_user_pool_id = module.auth.user_pool_id
  cognito_client_id    = module.auth.client_id
  allowed_origins      = [var.site_url, var.local_dev_url]
}

module "web" {
  source = "../../modules/web"

  name_prefix     = local.name_prefix
  lambda_url_host = module.backend.function_url_host
}

# ─────────────────────────────────────────────────────────────
# Tool Lambdas — Gateway targets (one module per tool)
# ─────────────────────────────────────────────────────────────

module "tool_finance" {
  source = "../../modules/tool-lambda"

  name_prefix       = local.name_prefix
  tool_name         = "finance"
  region            = var.region
  aws_profile       = var.aws_profile
  lambda_source_dir = "${path.module}/../../../tools/finance"
  timeout           = 30
  memory_size       = 256
}

module "tool_tavily" {
  source = "../../modules/tool-lambda"

  name_prefix       = local.name_prefix
  tool_name         = "tavily"
  region            = var.region
  aws_profile       = var.aws_profile
  lambda_source_dir = "${path.module}/../../../tools/tavily"
  timeout           = 30
  memory_size       = 256
}

module "tool_google_maps" {
  source = "../../modules/tool-lambda"

  name_prefix       = local.name_prefix
  tool_name         = "google-maps"
  region            = var.region
  aws_profile       = var.aws_profile
  lambda_source_dir = "${path.module}/../../../tools/google-maps"
  timeout           = 30
  memory_size       = 256
  environment_variables = {
    GOOGLE_MAPS_SECRET_ARN = var.google_maps_secret_id
  }
}

resource "aws_iam_role_policy" "tavily_secrets" {
  name = "secrets-read"
  role = module.tool_tavily.lambda_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = "arn:aws:secretsmanager:ap-northeast-2:612529367436:secret:bedrock-agentcore-identity!default/apikey/tavily_api_key*"
    }]
  })
}

resource "aws_iam_role_policy" "google_maps_secrets" {
  name = "secrets-read"
  role = module.tool_google_maps.lambda_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = var.google_maps_secret_arn_pattern
    }]
  })
}
