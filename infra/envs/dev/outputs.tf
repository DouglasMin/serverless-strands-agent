output "sessions_table_name" {
  value = module.data.sessions_table_name
}

output "lambda_function_url" {
  description = "Direct invoke URL of the chat Lambda (RESPONSE_STREAM)."
  value       = module.backend.function_url
}

output "cloudfront_domain" {
  description = "Public CloudFront domain serving the React UI and /api/* proxy."
  value       = module.web.cloudfront_domain
}

output "ui_bucket" {
  description = "S3 bucket that holds the built React assets."
  value       = module.web.ui_bucket
}

output "cloudfront_distribution_id" {
  value = module.web.cloudfront_distribution_id
}

output "lambda_image_uri" {
  description = "Container image currently deployed to the chat Lambda."
  value       = module.backend.image_uri
}

output "lambda_ecr_repository_url" {
  value = module.backend.ecr_repository_url
}
