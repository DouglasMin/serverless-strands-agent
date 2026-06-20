# Chat Lambda (Node.js)

Bridges the React UI to the AgentCore Runtime with SSE response streaming.

- **Entry:** `handler.handler` (ESM, `handler.mjs`)
- **Runtime:** Node.js 22 (arm64) — `public.ecr.aws/lambda/nodejs:22` base image
- **Packaging:** Container image pushed to ECR (`<prefix>-chat`)
- **Streaming:** native `awslambda.streamifyResponse` (no Lambda Web Adapter required)
- **Invoke mode:** `RESPONSE_STREAM` via Function URL
- **Auth:** `NONE` (proxied by CloudFront `/api/*`)

## Request

```
POST /api/chat
Content-Type: application/json

{ "sessionId": "<uuid, optional>", "prompt": "Hello" }
```

## Response (SSE)

```
event: session
data: {"sessionId":"..."}

event: delta
data: Hello

event: delta
data: ! How can I help?

event: done
data: {"sessionId":"..."}
```

Errors arrive as `event: error` with a JSON message.

## Update flow

1. Edit `handler.mjs` (or `package.json` / `Dockerfile`).
2. `cd infra/envs/dev && terraform apply`.
3. Terraform hashes the source tree, tags the image with the new hash, `docker buildx build --push`es to ECR, then updates `aws_lambda_function.chat.image_uri` so Lambda pulls the new digest.

## Environment variables (set by Terraform)

| Name | Purpose |
| --- | --- |
| `AGENT_RUNTIME_ARN` | Target AgentCore Runtime |
| `SESSIONS_TABLE` | DynamoDB table for chat history |
| `AWS_REGION_NAME` | Region for AWS SDK clients (`AWS_REGION` is reserved) |
| `SESSION_TTL_DAYS` | DDB TTL window for sessions (default 30) |
