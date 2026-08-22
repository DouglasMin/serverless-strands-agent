variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "sessions_table_arn" {
  type = string
}

variable "sessions_table" {
  type = string
}

variable "agent_runtime_arn" {
  type = string
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "lambda_source_dir" {
  description = "Path to the Lambda source directory (contains handler.py + Dockerfile)."
  type        = string
}

variable "aws_profile" {
  description = "Local AWS CLI profile used by docker/ecr push commands."
  type        = string
}

variable "image_retention_count" {
  description = "How many ECR image versions to keep before lifecycle policy prunes them."
  type        = number
  default     = 10
}

variable "cognito_user_pool_id" {
  description = "Cognito user pool the Lambda verifies ID tokens against."
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito app client ID the Lambda requires in the token `aud` claim."
  type        = string
}

variable "allowed_origins" {
  description = "Exact origins permitted by the Function URL CORS config. Replaces the previous wildcard now that requests carry an Authorization header."
  type        = list(string)
}
