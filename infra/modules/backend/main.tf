# ─────────────────────────────────────────────────────────────
# ECR repository for the chat Lambda image
# ─────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "lambda" {
  name                 = "${var.name_prefix}-chat"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # dev convenience

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "lambda" {
  repository = aws_ecr_repository.lambda.name

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

# ─────────────────────────────────────────────────────────────
# Compute a stable hash of the Lambda source tree. Anything that
# affects the image (handler.py, requirements.txt, Dockerfile, …)
# changes the hash → new tag → Lambda picks up the new image.
# ─────────────────────────────────────────────────────────────

locals {
  source_files = sort([
    for f in fileset(var.lambda_source_dir, "**/*") :
    f if !contains([
      ".venv", "__pycache__", ".pytest_cache", "tests",
      "README.md", "node_modules", ".npm"
    ], split("/", f)[0]) && !endswith(f, ".pyc")
  ])

  source_hash = substr(sha256(join("", [
    for f in local.source_files : filemd5("${var.lambda_source_dir}/${f}")
  ])), 0, 12)

  image_uri = "${aws_ecr_repository.lambda.repository_url}:${local.source_hash}"
}

# ─────────────────────────────────────────────────────────────
# Build + push image via local docker buildx (linux/arm64).
# Re-runs whenever source_hash changes.
# ─────────────────────────────────────────────────────────────

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

      REPO_URL="${aws_ecr_repository.lambda.repository_url}"
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

  depends_on = [aws_ecr_repository.lambda]
}

# ─────────────────────────────────────────────────────────────
# IAM role for the Lambda
# ─────────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda" {
  name = "${var.name_prefix}-chat-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "ddb" {
  name = "ddb-sessions"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ]
      Resource = var.sessions_table_arn
    }]
  })
}

resource "aws_iam_role_policy" "agentcore" {
  name = "invoke-agent-runtime"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "bedrock-agentcore:InvokeAgentRuntime"
      ]
      Resource = [
        var.agent_runtime_arn,
        "${var.agent_runtime_arn}/*"
      ]
    }]
  })
}

# ─────────────────────────────────────────────────────────────
# Lambda function (container image)
# ─────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.name_prefix}-chat"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "chat" {
  function_name = "${var.name_prefix}-chat"
  role          = aws_iam_role.lambda.arn
  package_type  = "Image"
  image_uri     = local.image_uri
  architectures = ["arm64"]
  timeout       = 300
  memory_size   = 512

  environment {
    variables = {
      AGENT_RUNTIME_ARN = var.agent_runtime_arn
      SESSIONS_TABLE    = var.sessions_table
      AWS_REGION_NAME   = var.region # AWS_REGION is reserved
    }
  }

  depends_on = [
    null_resource.build_and_push,
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.ddb,
    aws_iam_role_policy.agentcore
  ]
}

resource "aws_lambda_function_url" "chat" {
  function_name      = aws_lambda_function.chat.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"

  cors {
    allow_origins  = ["*"] # Tighten at the CloudFront layer
    allow_methods  = ["POST", "GET"] # OPTIONS is auto-handled; declaring it fails Lambda's 6-char member limit
    allow_headers  = ["content-type"]
    expose_headers = ["content-type"]
    max_age        = 86400
  }
}

# authorization_type=NONE only disables SigV4; we still need a resource policy
# that allows anonymous principals to call InvokeFunctionUrl.
resource "aws_lambda_permission" "function_url_public" {
  statement_id           = "AllowPublicFunctionURLInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.chat.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# October 2025+ Lambda Function URLs require BOTH lambda:InvokeFunctionUrl
# AND lambda:InvokeFunction on the resource policy, even when auth_type=NONE.
# Without this second statement, the URL returns 403 AccessDeniedException.
# aws_lambda_permission has no native arg for the
# `lambda:InvokedViaFunctionUrl` condition; we accept the broader grant here
# because the function is invoked exclusively through the public URL anyway.
resource "aws_lambda_permission" "function_invoke_public" {
  statement_id  = "AllowPublicFunctionInvokeViaUrl"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chat.function_name
  principal     = "*"
}

