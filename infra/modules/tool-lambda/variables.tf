variable "name_prefix" {
  type = string
}

variable "tool_name" {
  description = "Short identifier for the tool (e.g. finance, weather). Used in resource names."
  type        = string
}

variable "region" {
  type = string
}

variable "aws_profile" {
  type = string
}

variable "lambda_source_dir" {
  description = "Path to the tool Lambda source directory (contains handler.py + Dockerfile)."
  type        = string
}

variable "timeout" {
  description = "Lambda timeout in seconds."
  type        = number
  default     = 30
}

variable "memory_size" {
  description = "Lambda memory in MB."
  type        = number
  default     = 256
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "image_retention_count" {
  type    = number
  default = 10
}
