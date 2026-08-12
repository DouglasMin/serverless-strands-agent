# Serverless Strands Agent

AWS AgentCore + Strands Agent 기반 서버리스 AI 챗봇 아키텍처.

## Architecture

```
User → CloudFront (CDN) → S3 (React SPA)
                       ↘ /api/* → Lambda Function URL (Node.js, SSE streaming)
                                     ↓
                              AgentCore Runtime (Strands Agent, Python)
                                     ↓
                   ┌─────────────────┼─────────────────┐
                   │                 │                  │
            Bedrock LLM     AgentCore Gateway    AgentCore Identity (3LO)
                   │          │       │    │            │
          AgentCore Memory   Yahoo  Tavily Maps  ┌──────┼──────┐
          (STM + LTM)       Finance Search       │      │      │
                                            GitHub  Google   Notion
                                                   Calendar
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript |
| CDN | CloudFront + S3 (OAC) |
| Backend | Lambda (Node.js 22, container image, arm64) |
| Agent Runtime | AgentCore Runtime (Firecracker microVM) |
| Agent Framework | Strands Agents (Python) |
| Memory | AgentCore Memory (STM + LTM: Summarization, User Preference, Semantic) |
| Tools (Gateway) | AgentCore Gateway → Yahoo Finance, Tavily Search, Google Maps (Lambda targets) |
| Tools (OAuth) | GitHub, Google Calendar (read+write), Notion (read) via AgentCore Identity 3LO |
| Data | DynamoDB (sessions, GSI byUser) |
| IaC | Terraform (custom infra) + AgentCore CLI (runtime) |

## Project Structure

```
├── frontend/          # React + Vite SPA (editorial dark theme)
├── backend/           # Lambda handler (Node.js, SSE streaming proxy)
├── serverlessstrands/ # AgentCore project (Strands agent + memory + gateway)
│   ├── app/MainAgent/ # Python agent code
│   │   ├── oauth_tools/  # GitHub, Google Calendar, Notion tools (3LO OAuth)
│   │   └── mcp_client/   # AgentCore Gateway MCP client
│   └── agentcore/     # agentcore.json, aws-targets.json
├── tools/             # Gateway Lambda tool targets
│   ├── finance/       # Yahoo Finance (yfinance)
│   ├── google-maps/   # Google Maps Platform route preview tools
│   └── tavily/        # Tavily web search (Secrets Manager key)
├── infra/             # Terraform modules
│   ├── modules/
│   │   ├── backend/   # ECR + Lambda + Function URL + IAM (AgentCore + OAuth)
│   │   ├── data/      # DynamoDB
│   │   ├── tool-lambda/ # Reusable module for Gateway tool Lambdas
│   │   └── web/       # S3 + CloudFront
│   └── envs/dev/      # Dev environment
└── scripts/           # deploy.sh, post_deploy.py (IAM patcher)
```

## Prerequisites

- AWS CLI v2 + profile `developer-dongik` configured
- Node.js 22+
- Python 3.12+
- Terraform 1.5+
- Docker (for Lambda container build)
- AgentCore CLI: `npm install -g @aws/agentcore`

## Deploy

### 1. AgentCore (Agent + Memory + Gateway)

```bash
cd serverlessstrands
AWS_PROFILE=developer-dongik agentcore deploy -y
./scripts/deploy.sh  # includes post_deploy.py IAM patcher
```

### 2. Infrastructure (Terraform)

```bash
cd infra/envs/dev
terraform init
terraform apply
```

### 3. Backend Lambda (container image)

```bash
cd backend
aws ecr get-login-password --region ap-northeast-2 --profile developer-dongik \
  | docker login --username AWS --password-stdin 612529367436.dkr.ecr.ap-northeast-2.amazonaws.com
docker buildx build --platform linux/arm64 \
  -t 612529367436.dkr.ecr.ap-northeast-2.amazonaws.com/serverlessstrands-dev-chat:latest --push .
terraform -chdir=../infra/envs/dev apply
```

### 4. Frontend

```bash
cd frontend
npm install && npm run build
aws s3 sync dist/ s3://<UI_BUCKET> --delete --profile developer-dongik
aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*" --profile developer-dongik
```

## AgentCore Inventory Audit

The deployed AgentCore resources are partly managed outside Terraform and are guarded by a read-only inventory audit.

```bash
python3 scripts/audit_agentcore_resources.py --profile developer-dongik
```

Expected result: runtime, memory, Gateway targets, Identity providers, Code Interpreter, Browser, and log group checks pass. Registry currently reports an expected access warning because `list-registries` is not authorized for this profile.

Details: `docs/agentcore-inventory.md`

## Features (Completed)

- [x] Streaming chat (SSE) with AgentCore Runtime
- [x] Cross-session memory (STM + LTM with 3 strategies)
- [x] Session list with recency grouping (today/yesterday/last 7d/older)
- [x] Editorial dark UI (Instrument Serif + Inter Tight + JetBrains Mono)
- [x] AgentCore Gateway — Yahoo Finance, Tavily Search, Google Maps (Lambda targets)
- [x] AgentCore Identity 3LO — GitHub, Google Calendar (full read+write), Notion (read)
- [x] Google Mobility Assistant — Calendar event location, Maps route preview, reminder confirmation
- [x] Tavily Lambda workaround for Gateway Integration bug (ap-northeast-2)
- [x] Reusable `tool-lambda` Terraform module (ECR + Docker + Lambda + IAM)
- [x] Tool use badges with SVG/PNG icons per tool
- [x] Markdown rendering in assistant responses
- [x] IAM auto-patcher (post_deploy.py) for AgentCore CDK permission gaps
- [x] `google_calendar_date_info` utility tool (date/day-of-week without external API)

## TODO

- [ ] User Auth (Cognito) — replace localStorage userId
- [ ] Telegram bot integration (second channel)
- [ ] Gmail OAuth tool (AgentCore Identity 3LO)
- [ ] MS Office tools (OneDrive, Outlook)
- [ ] Specialized Agents via A2A (Deep Research, Code Agent)
- [x] Observability — Langfuse Cloud tracing via OTLP (`scripts/README.md` → Tracing)
- [ ] Code Interpreter tool (sandboxed execution)
- [ ] Browser tool (AgentCore Browser + Nova Act)
- [ ] Speech model integration
- [ ] More public API tools (weather, news, etc.)
- [ ] Production hardening (rate limiting, error monitoring, WAF)
- [ ] CI/CD pipeline (frontend deploy + backend image build)

## Known Gotchas

1. **Lambda Function URL** requires BOTH `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction` permissions (Oct 2025 change)
2. **AgentCore Memory `retrieval_config`** must be explicitly provided — `None` silently skips all LTM retrieval
3. **AgentCore CDK auto-role** is missing `RetrieveMemoryRecords` — `post_deploy.py` patches this after every deploy
4. **Python Lambda** does NOT support native response streaming — use Node.js with `awslambda.streamifyResponse()`
5. **AgentCore `runtimeSessionId`** must be ≥33 chars (use full UUIDs)
6. **AgentCore Gateway Integration targets** (openApiSchema) in ap-northeast-2 have a service bug — credential fetch count stays at 0, returns "An internal error occurred". Workaround: wrap API in Lambda, register as Lambda target
7. **Gateway target type change** — cannot update from `openApiSchema` to `lambda`; must delete and recreate
8. **Langfuse tracing is mutually exclusive with CloudWatch GenAI Observability** — `DISABLE_ADOT_OBSERVABILITY=true` is required; you cannot dual-export without running your own collector
9. **Strands only writes tool I/O as span attributes when the OTLP endpoint contains `langfuse`** (`Tracer.is_langfuse`) — otherwise tool calls render with empty payloads in the Langfuse UI
10. **Disabling ADOT also disables its instrumentation filtering** — AgentCore's `GET /ping` health check (every ~2s per container) gets traced and floods the backend; `OTEL_PYTHON_EXCLUDED_URLS=/ping$` is required
11. **SSE streaming emits one ASGI `http send` span per chunk** (~70 per answer) — no env var can drop them, so `starlette`/`asgi` instrumentation is disabled via `OTEL_PYTHON_DISABLED_INSTRUMENTATIONS`
12. **Containers warm at deploy time keep serving old env/IAM** — after a post-deploy IAM fix, existing containers still fail until they rotate; verify against a freshly-started container, not the first invocation
8. **Browser geolocation is per-request context** — location-bearing turns disable AgentCore Memory; do not store current location in Memory or DynamoDB unless product requirements change and user consent is explicit

## License

Private — not for redistribution.
