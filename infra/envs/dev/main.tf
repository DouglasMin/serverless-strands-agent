locals {
  name_prefix = "${var.project_name}-${var.env}"
}

module "data" {
  source = "../../modules/data"

  name_prefix      = local.name_prefix
  session_ttl_days = var.session_ttl_days
}

module "backend" {
  source = "../../modules/backend"

  name_prefix        = local.name_prefix
  region             = var.region
  aws_profile        = var.aws_profile
  sessions_table_arn = module.data.sessions_table_arn
  sessions_table     = module.data.sessions_table_name
  agent_runtime_arn  = var.agent_runtime_arn
  log_retention_days = var.log_retention_days
  lambda_source_dir  = "${path.module}/../../../backend"
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
