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
