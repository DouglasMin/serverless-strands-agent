output "function_name" {
  value = aws_lambda_function.chat.function_name
}

output "function_url" {
  value = aws_lambda_function_url.chat.function_url
}

# CloudFront needs just the hostname, not the scheme/trailing slash.
output "function_url_host" {
  value = replace(replace(aws_lambda_function_url.chat.function_url, "https://", ""), "/", "")
}

output "role_arn" {
  value = aws_iam_role.lambda.arn
}

output "ecr_repository_url" {
  value = aws_ecr_repository.lambda.repository_url
}

output "image_uri" {
  value = aws_lambda_function.chat.image_uri
}
