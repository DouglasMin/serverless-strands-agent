variable "name_prefix" {
  type = string
}

variable "lambda_url_host" {
  description = "Lambda Function URL hostname (without scheme or trailing slash)."
  type        = string
}
