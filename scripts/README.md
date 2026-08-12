# scripts

Post-deploy hooks for the AgentCore stack. They exist to paper over known
gaps in the agentcore CDK before the agent goes live.

## What's here

| File | Purpose |
| --- | --- |
| `deploy.sh` | Wrapper: `agentcore deploy` → IAM fixups. **Use this instead of bare `agentcore deploy`.** |
| `post_deploy.py` | Idempotent IAM patcher. Safe to re-run anytime. Self-fetches boto3 via `uv run --with boto3`. |

## Why we need `post_deploy.py`

`agentcore deploy` auto-creates IAM roles for each runtime, but **misses
permissions the runtime actually needs**. The bugs found so far:

| Missing permission | Symptom | Fix |
| --- | --- | --- |
| `bedrock-agentcore:RetrieveMemoryRecords` on Memory resources | Memory extraction works, but the agent never sees stored preferences. Only visible as `WARN ... AccessDeniedException` in CloudWatch. | `post_deploy.py` attaches `AgentCorePostDeployFixups` inline policy to every agent role. |
| `secretsmanager:GetSecretValue` on `serverlessstrands/langfuse` | Agent runs fine but emits **zero traces** to Langfuse. Visible only as `[otel_bootstrap] tracing setup failed (...AccessDenied...)` on the first log line after a cold start. | Same inline policy, `LangfuseTracingSecretRead` statement. |

When AWS fixes these gaps upstream this script becomes a no-op (still
idempotent, still safe to run).

## Tracing (Langfuse)

Traces go to Langfuse Cloud instead of CloudWatch GenAI Observability — the two
are mutually exclusive, and `DISABLE_ADOT_OBSERVABILITY=true` in
`agentcore.json` turns the AWS side off.

The wiring lives in `app/MainAgent/otel_bootstrap.py`, which is the container
entrypoint. It reads the Langfuse keypair from Secrets Manager, exports the
`OTEL_EXPORTER_OTLP_*` vars, then execs `opentelemetry-instrument python -m main`.

Two reasons it has to happen before exec rather than inside `main.py`:

1. `opentelemetry-instrument` reads the OTLP env vars once, at process start.
2. Strands' `Tracer.is_langfuse` greps `OTEL_EXPORTER_OTLP_ENDPOINT` for the
   string `langfuse`. Only when it matches does Strands write tool input/output
   as span **attributes**; otherwise they become span **events**, which Langfuse
   does not render — tool calls would appear in the UI with empty payloads.

It also suppresses two sources of span spam, both of which the ADOT distro
normally handled as part of `AGENT_OBSERVABILITY_ENABLED` — which we turned off
along with ADOT, so we have to do it ourselves:

| Var | Why |
| --- | --- |
| `OTEL_PYTHON_EXCLUDED_URLS=/ping$` | AgentCore health-checks `GET /ping` every ~2s per container. Traced, that is ~40k spans/day per container against a 50k/month free tier. |
| `OTEL_PYTHON_DISABLED_INSTRUMENTATIONS=starlette,asgi,urllib3` | The agent streams over SSE and the ASGI instrumentation emits one `http send` span **per chunk** — measured 104 observations for a single answer, ~70 of them noise. There is no env var to drop send/receive spans, so the HTTP instrumentation is disabled outright. |

Disabling Starlette costs nothing meaningful: Strands emits its own
`invoke_agent`, tool, and generation spans from its own tracer. `botocore` stays
enabled so AgentCore Memory calls stay visible, and `threading` stays enabled
because Strands depends on it for trace-context propagation across threads.

Creating/rotating the secret (it is **not** managed by Terraform, matching how
the other tool secrets in this project are handled):

```bash
AWS_PROFILE=developer-dongik aws secretsmanager create-secret \
  --name serverlessstrands/langfuse \
  --region ap-northeast-2 \
  --secret-string '{"public_key":"pk-lf-...","secret_key":"sk-lf-...","host":"https://jp.cloud.langfuse.com"}'

# rotate later with: aws secretsmanager put-secret-value --secret-id serverlessstrands/langfuse --secret-string '{...}'
```

`host` is optional and defaults to `https://jp.cloud.langfuse.com` — this
project's Langfuse org is in the **Japan** region, closest to `ap-northeast-2`.
The host must match the region where the Langfuse project was created; keys from
a JP project will 401 against the US or EU ingestion endpoint.

## Usage

```bash
# Standard flow — replaces `agentcore deploy`
./scripts/deploy.sh

# Already deployed; just patch IAM
./scripts/deploy.sh --skip-deploy

# Or call directly from the agentcore project dir
cd serverlessstrands && python ../scripts/post_deploy.py
```

The script requires `uv` (already installed via Homebrew) — it boots boto3
ephemerally so you don't need a permanent venv.

## Verifying it worked

After running, the agent role should have an inline policy:

```bash
ROLE=$(AWS_PROFILE=developer-dongik aws bedrock-agentcore-control get-agent-runtime \
    --agent-runtime-id serverlessstrands_MainAgent-XXXX \
    --region ap-northeast-2 --query 'roleArn' --output text | cut -d/ -f2)

AWS_PROFILE=developer-dongik aws iam get-role-policy \
    --role-name "$ROLE" \
    --policy-name AgentCorePostDeployFixups
```

End-to-end smoke test (cross-session memory):

```bash
URL=<lambda function url>
USER=test-user-001
S1=$(uuidgen | tr 'A-Z' 'a-z')
S2=$(uuidgen | tr 'A-Z' 'a-z')

curl -N -X POST "$URL/api/chat" -H 'content-type: application/json' \
  -d "{\"userId\":\"$USER\",\"sessionId\":\"$S1\",\"prompt\":\"앞으로 한국어로만 답해줘.\"}"

# wait ~90s for USER_PREFERENCE extraction
sleep 90

curl -N -X POST "$URL/api/chat" -H 'content-type: application/json' \
  -d "{\"userId\":\"$USER\",\"sessionId\":\"$S2\",\"prompt\":\"Tell me about Mars.\"}"
# → should answer in Korean
```
