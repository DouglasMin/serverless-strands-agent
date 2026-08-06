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
