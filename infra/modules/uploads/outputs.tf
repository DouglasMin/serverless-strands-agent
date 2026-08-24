output "bucket_id" {
  value       = aws_s3_bucket.uploads.id
  description = "The name of the user uploads S3 bucket"
}

output "bucket_arn" {
  value       = aws_s3_bucket.uploads.arn
  description = "The ARN of the user uploads S3 bucket"
}
