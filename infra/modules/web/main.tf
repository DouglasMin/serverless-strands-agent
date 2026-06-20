resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "ui" {
  bucket        = "${var.name_prefix}-ui-${random_id.bucket_suffix.hex}"
  force_destroy = true # dev env convenience
}

resource "aws_s3_bucket_public_access_block" "ui" {
  bucket                  = aws_s3_bucket.ui.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "ui" {
  bucket = aws_s3_bucket.ui.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_cloudfront_origin_access_control" "ui" {
  name                              = "${var.name_prefix}-ui-oac"
  description                       = "OAC for UI bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Managed cache policies (AWS-provided IDs, no need to look up)
locals {
  managed_caching_disabled_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
  managed_caching_optimized_id         = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  managed_all_viewer_except_host_orp   = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${var.name_prefix} UI + Lambda chat proxy"
  price_class         = "PriceClass_200" # NA + EU + Asia (good for KR)

  # S3 origin (default behavior)
  origin {
    origin_id                = "s3-ui"
    domain_name              = aws_s3_bucket.ui.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.ui.id
  }

  # Lambda Function URL origin (/api/* behavior)
  origin {
    origin_id   = "lambda-chat"
    domain_name = var.lambda_url_host

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "s3-ui"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = local.managed_caching_optimized_id
  }

  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "lambda-chat"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = false # SSE must not be buffered/compressed
    cache_policy_id          = local.managed_caching_disabled_id
    origin_request_policy_id = local.managed_all_viewer_except_host_orp
  }

  # SPA fallback: 403/404 from S3 → /index.html with 200
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "ui" {
  bucket = aws_s3_bucket.ui.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontReadViaOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.ui.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
        }
      }
    }]
  })
}
