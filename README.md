# Serverless Strands Agent

AWS AgentCore + Strands Agent 기반 서버리스 AI 챗봇 아키텍처.

## Architecture

```
User → CloudFront (CDN) → S3 (React SPA)
                       ↘ /api/* → Lambda Function URL (Node.js, SSE streaming)
                                     ↓
                              AgentCore Runtime (Strands Agent, Python)
                                     ↓
                              ┌──────┴──────┐
                              │             │
                         Bedrock LLM    AgentCore Gateway
                              │             │
                       AgentCore Memory   MCP Tools (Tavily)
                       (STM + LTM)
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
| Tools | AgentCore Gateway → Tavily Search |
| Data | DynamoDB (sessions, GSI byUser) |
| IaC | Terraform (custom infra) + AgentCore CLI (runtime) |

## Project Structure

```
├── frontend/          # React + Vite SPA (editorial dark theme)
├── backend/           # Lambda handler (Node.js, SSE streaming proxy)
├── serverlessstrands/ # AgentCore project (Strands agent + memory + gateway)
│   ├── app/MainAgent/ # Python agent code
│   └── agentcore/     # agentcore.json, aws-targets.json
├── infra/             # Terraform modules
│   ├── modules/
│   │   ├── backend/   # ECR + Lambda + Function URL
│   │   ├── data/      # DynamoDB
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

## Features (Completed)

- [x] Streaming chat (SSE) with AgentCore Runtime
- [x] Cross-session memory (STM + LTM with 3 strategies)
- [x] Session list with recency grouping (today/yesterday/last 7d/older)
- [x] Editorial dark UI (Instrument Serif + Inter Tight + JetBrains Mono)
- [x] AgentCore Gateway + Tavily Search tool
- [x] Tool use badges (shows which tools were invoked per message)
- [x] Markdown rendering in assistant responses
- [x] IAM auto-patcher (post_deploy.py) for AgentCore CDK permission gaps

## TODO

- [ ] User Auth (Cognito) — replace localStorage userId
- [ ] Frontend S3 deploy + CloudFront invalidation (CI/CD)
- [ ] Telegram bot integration (second channel)
- [ ] More MCP tools (Brave Search, custom Lambda tools)
- [ ] Specialized Agents via A2A (Deep Research, Code Agent)
- [ ] AgentCore Identity + 3LO (Gmail, Calendar, GitHub, Notion)
- [ ] AgentCore Observability setup
- [ ] Code Interpreter / Browser sandboxed tools
- [ ] Speech model integration
- [ ] Production hardening (rate limiting, error monitoring, WAF)

## Known Gotchas

1. **Lambda Function URL** requires BOTH `lambda:InvokeFunctionUrl` AND `lambda:InvokeFunction` permissions (Oct 2025 change)
2. **AgentCore Memory `retrieval_config`** must be explicitly provided — `None` silently skips all LTM retrieval
3. **AgentCore CDK auto-role** is missing `RetrieveMemoryRecords` — `post_deploy.py` patches this after every deploy
4. **Python Lambda** does NOT support native response streaming — use Node.js with `awslambda.streamifyResponse()`
5. **AgentCore `runtimeSessionId`** must be ≥33 chars (use full UUIDs)

## License

Private — not for redistribution.
