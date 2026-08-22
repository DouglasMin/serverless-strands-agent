variable "project_name" {
  description = "Project identifier used in resource names and tags."
  type        = string
  default     = "serverlessstrands"
}

variable "env" {
  description = "Environment name (dev, stage, prod)."
  type        = string
  default     = "dev"
}

variable "region" {
  description = "Primary AWS region for all stateful resources."
  type        = string
  default     = "ap-northeast-2"
}

variable "aws_profile" {
  description = "Local AWS CLI profile used by Terraform."
  type        = string
  default     = "developer-dongik"
}

variable "agent_runtime_arn" {
  description = "ARN of the AgentCore Runtime to invoke. Produced by 'agentcore deploy'."
  type        = string
}

variable "session_ttl_days" {
  description = "DynamoDB session item TTL in days."
  type        = number
  default     = 30
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the Lambda function."
  type        = number
  default     = 14
}

variable "google_maps_secret_id" {
  description = "Secrets Manager secret name or full ARN containing JSON with api_key_value for Google Maps Platform."
  type        = string
}

variable "google_maps_secret_arn_pattern" {
  description = "Secrets Manager ARN pattern allowing GetSecretValue for the Google Maps API key secret."
  type        = string
}

variable "site_url" {
  description = <<-DESC
    Public origin of the SPA, no trailing path. Used as the Cognito redirect
    target. Declared as a variable rather than read from module.web to avoid a
    dependency cycle (backend -> auth -> web -> backend); the CloudFront domain
    is stable, so this is safe to pin.
  DESC
  type        = string
  default     = "https://d1rur2clzx2nyl.cloudfront.net"
}

variable "local_dev_url" {
  description = "Vite dev server origin, registered as an additional Cognito callback so sign-in works locally."
  type        = string
  default     = "http://localhost:5173"
}

variable "cognito_domain_prefix" {
  description = "Globally unique hosted-UI subdomain prefix."
  type        = string
  default     = "serverlessstrands-dev"
}

variable "google_client_id" {
  description = "Google Cloud OAuth 2.0 Web client ID used by Cognito for federated sign-in."
  type        = string
}

variable "google_client_secret" {
  description = "Google Cloud OAuth 2.0 Web client secret used by Cognito for federated sign-in."
  type        = string
  sensitive   = true
}
