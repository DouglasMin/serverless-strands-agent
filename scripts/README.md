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

When AWS fixes these gaps upstream this script becomes a no-op (still
idempotent, still safe to run).

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
