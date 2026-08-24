variable "name_prefix" {
  type        = string
  description = "Resource name prefix (e.g. serverlessstrands-dev)"
}

variable "allowed_origins" {
  type        = list(string)
  description = "Allowed origins for CORS (CloudFront URL, localhost)"
  default     = ["*"]
}

variable "upload_retention_days" {
  type        = number
  description = "Days before uploaded files expire"
  default     = 30
}
