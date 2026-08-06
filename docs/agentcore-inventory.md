# AgentCore Inventory

Last audited: 2026-07-10  
Region: `ap-northeast-2`  
Account: `612529367436`

This document records the non-secret AgentCore resources that the service depends on. The executable source of the baseline is `serverlessstrands/agentcore/expected-agentcore-resources.json`.

Run the audit:

```bash
python3 scripts/audit_agentcore_resources.py --profile developer-dongik
```

The script is read-only. It checks control-plane metadata and does not fetch OAuth client secrets, API key values, or user resource tokens.

## Current Result

The audit passes with one expected warning:

```text
AgentCore inventory matches expected baseline with 1 warning(s).
```

The warning is Registry access:

```text
[WARN] registry access denied; recorded as currently unverified
```

Registry is therefore `unknown`, not confirmed absent.

## Verified Resources

### Runtime

- Runtime ID: `serverlessstrands_MainAgent-4l0O95618E`
- Status: `READY`
- Network: `PUBLIC`
- Required env vars verified:
  - `MEMORY_ID`
  - `MEMORY_CHATMEMORY_ID`
  - `WORKLOAD_NAME`
  - `OAUTH_CALLBACK_URL`
  - `AGENTCORE_GATEWAY_MAINGATEWAY_AUTH_TYPE`
  - `AGENTCORE_GATEWAY_MAINGATEWAY_URL`

### Memory

- Memory ID: `serverlessstrands_ChatMemory-4Q3NbO5016`
- Status: `ACTIVE`
- Event expiry: `30`
- Namespaces verified:
  - `SEMANTIC`: `/users/{actorId}/facts`
  - `USER_PREFERENCE`: `/users/{actorId}/preferences`
  - `SUMMARIZATION`: `/summaries/{actorId}/{sessionId}`

### Gateway

- Gateway: `serverlessstrands-MainGateway`
- URL: `https://serverlessstrands-maingateway-fiobtnuvkj.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp`
- Status: `READY`
- Auth: `NONE`

Targets verified:

| Target | Lambda | Tools |
| --- | --- | --- |
| `yahoo-finance` | `serverlessstrands-dev-tool-finance` | `stock_quote`, `stock_history`, `stock_compare`, `financial_news`, `stock_analysis`, `options_chain` |
| `tavily-lamdba-tool` | `serverlessstrands-dev-tool-tavily` | `TavilySearchPost`, `TavilySearchExtract` |
| `google-maps` | `serverlessstrands-dev-tool-google-maps` | `google_maps_geocode`, `google_maps_place_search`, `google_maps_compute_route`, `google_maps_route_preview` |

The `google-maps` target is expected after the Google Maps Lambda is deployed and registered:

```bash
terraform -chdir=infra/envs/dev apply -var-file=terraform.tfvars
python3 scripts/register_google_maps_gateway_target.py \
  --profile developer-dongik \
  --region ap-northeast-2 \
  --lambda-arn "$(terraform -chdir=infra/envs/dev output -raw google_maps_lambda_arn)"
```

### Identity

OAuth providers verified:

- `github-provider`: `READY`
- `google-calendar-provider`: `READY`
- `notion-provider`: `READY`

API key providers verified:

- `tavily_api_key`: `MANAGED`

Workload identity verified:

- Name: `serverlessstrands_MainAgent-4l0O95618E`
- Allowed return URL includes `https://d1rur2clzx2nyl.cloudfront.net/auth/callback`

Token vault verified:

- Vault ID: `default`
- KMS key type: `ServiceManagedKey`

### Sandbox

- Code Interpreter: `serverless_strands_code_interpreter`, `READY`
- Browser: `serverless_strands_agent_broswer_tool`, `READY`

### Observability

- Runtime log group exists:
  - `/aws/bedrock-agentcore/runtimes/serverlessstrands_MainAgent-4l0O95618E-DEFAULT`
- Online evaluation configs are currently empty.

## Source-Of-Truth Drift

`serverlessstrands/agentcore/agentcore.json` declares the runtime, memory, and gateway shell, but does not declare the currently deployed credentials or gateway targets:

```json
"credentials": [],
"targets": []
```

This is intentional for now because these resources already exist in AWS and the repo is using AgentCore CLI plus manual/API-managed AgentCore resources. The drift is now guarded by `scripts/audit_agentcore_resources.py`.

Later decision:

- Keep this as an out-of-band AgentCore resource model with audit checks.
- Or import/encode Gateway targets and Identity providers into the AgentCore project config if the CLI supports those resource shapes reliably.

## Interpretation

Frontend Notion and Google Calendar prompts prove the 3LO happy path for the current user and browser. This audit proves a different thing: the deployed AgentCore resource names, callback URL, workload identity, Gateway targets, Lambda ARNs, and memory namespaces still match what the repo expects after deploys.
