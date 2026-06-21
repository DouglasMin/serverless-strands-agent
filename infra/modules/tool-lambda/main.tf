# ─────────────────────────────────────────────────────────────
# Reusable module for Gateway tool Lambdas (container image).
# Each tool gets: ECR repo, Docker build+push, Lambda function.
# Gateway invokes via Lambda ARN (no Function URL needed).
# ─────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "this" {
  name                 = "${var.name_prefix}-tool-${var.tool_name}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last ${var.image_retention_count} images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = var.image_retention_count
      }
      action = { type = "expire" }
    }]
  })
}

# ── Source hash for image tagging ──────────────────────────────

locals {
  source_files = sort([
    for f in fileset(var.lambda_source_dir, "**/*") :
    f if !contains([
      ".venv", "__pycache__", ".pytest_cache", "node_modules",
    ], split("/", f)[0]) && !endswith(f, ".pyc")
  ])

  source_hash = substr(sha256(join("", [
    for f in local.source_files : filemd5("${var.lambda_source_dir}/${f}")
  ])), 0, 12)

  image_uri = "${aws_ecr_repository.this.repository_url}:${local.source_hash}"
}

# ── Docker build + push ────────────────────────────────────────

resource "null_resource" "build_and_push" {
  triggers = {
    source_hash = local.source_hash
    image_uri   = local.image_uri
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    environment = {
      AWS_PROFILE = var.aws_profile
      AWS_REGION  = var.region
    }
    command = <<-EOT
      set -euo pipefail

      REPO_URL="${aws_ecr_repository.this.repository_url}"
      REGISTRY="$${REPO_URL%%/*}"
      TAG="${local.source_hash}"

      echo "→ ECR login: $REGISTRY"
      aws ecr get-login-password --region "${var.region}" \
        | docker login --username AWS --password-stdin "$REGISTRY"

      echo "→ docker buildx build (linux/arm64) → push $REPO_URL:$TAG"
      docker buildx build \
        --platform linux/arm64 \
        --provenance=false \
        -t "$REPO_URL:$TAG" \
        --push \
        "${var.lambda_source_dir}"
    EOT
  }

  depends_on = [aws_ecr_repository.this]
}

# ── IAM ────────────────────────────────────────────────────────

resource "aws_iam_role" "this" {
  name = "${var.name_prefix}-tool-${var.tool_name}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ── Lambda function ────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name_prefix}-tool-${var.tool_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "this" {
  function_name = "${var.name_prefix}-tool-${var.tool_name}"
  role          = aws_iam_role.this.arn
  package_type  = "Image"
  image_uri     = local.image_uri
  architectures = ["arm64"]
  timeout       = var.timeout
  memory_size   = var.memory_size

  depends_on = [
    null_resource.build_and_push,
    aws_cloudwatch_log_group.this,
  ]
}

# Gateway needs permission to invoke this Lambda
resource "aws_lambda_permission" "gateway_invoke" {
  statement_id  = "AllowBedrockAgentCoreGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "bedrock-agentcore.amazonaws.com"
}
