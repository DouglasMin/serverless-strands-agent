resource "aws_dynamodb_table" "sessions" {
  name         = "${var.name_prefix}-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"

  attribute {
    name = "sessionId"
    type = "S"
  }

  # GSI keys must be declared as table attributes.
  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "updatedAt"
    type = "N"
  }

  # Used by the chat Lambda to list a user's sessions newest-first.
  global_secondary_index {
    name            = "byUser"
    hash_key        = "userId"
    range_key       = "updatedAt"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }
}
