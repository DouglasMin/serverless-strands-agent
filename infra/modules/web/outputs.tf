output "ui_bucket" {
  value = aws_s3_bucket.ui.bucket
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "cloudfront_arn" {
  value = aws_cloudfront_distribution.main.arn
}
