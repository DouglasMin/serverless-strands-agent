# Serverless Strands Agent Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the AWS AgentCore + Strands serverless agent so the deployed service matches the target architecture and the repo can prove that match continuously.

**Architecture:** React/CloudFront sends chat traffic to a Node.js Lambda SSE proxy, which invokes the Strands orchestrator in AgentCore Runtime. AgentCore Memory, Gateway, Identity, Code Interpreter, Browser, A2A specialists, and observability are treated as explicit service dependencies with audit scripts, runtime wiring, smoke tests, and docs. Terraform owns custom AWS resources; AgentCore CLI owns AgentCore resources until a later migration decision is made.

**Tech Stack:** React 19, Vite, TypeScript, Node.js 22 Lambda, DynamoDB, Python Strands Agents, Amazon Bedrock AgentCore Runtime/Memory/Gateway/Identity/Browser/Code Interpreter, Terraform, AWS CLI, boto3, pytest, node:test.

---

## Priority Model

| Rank | Workstream | Importance | Completion Contribution | Difficulty | Why this order |
| --- | --- | ---: | ---: | ---: | --- |
| P0 | AgentCore inventory and drift guard | 5 | 5 | 2 | The repo and AWS are already diverged; every later task needs a trusted baseline. |
| P0 | Gateway + Identity source-of-truth checks | 5 | 5 | 3 | Finance, Tavily, GitHub, Google Calendar, and Notion are core diagram capabilities already deployed out-of-band. |
| P0 | MCP endpoint config + runtime tool registry | 5 | 4 | 2 | The agent must consume AgentCore-injected env vars and expose tools deterministically. |
| P0 | Code Interpreter production wiring | 5 | 4 | 3 | The AWS resource exists and code is partially wired; finish it before adding harder tools. |
| P0 | End-to-end deployment and smoke runbook | 5 | 5 | 2 | Without repeatable smoke tests, the architecture can look complete while runtime behavior is broken. |
| P1 | AgentCore Browser + Nova Act path | 4 | 4 | 4 | The Browser resource exists, but the MainAgent does not use it. |
| P1 | A2A specialist agents | 4 | 5 | 5 | High architecture value, but larger contract and orchestration work. |
| P1 | Cognito user auth | 5 | 4 | 4 | Replaces anonymous localStorage user IDs with real user boundaries. |
| P1 | Observability dashboards, alarms, traces | 4 | 4 | 3 | Needed for production operation after core flows are working. |
| P2 | Registry verification and record model | 3 | 3 | 3 | Registry access is currently blocked by IAM, so first work is permission and model discovery. |
| P2 | Telegram, Gmail, Office, speech, more public APIs | 3 | 3 | 3-5 | Valuable expansions after the core AgentCore layers are stable. |
| P2 | CI/CD and production hardening | 4 | 4 | 4 | Important before broader release; easier once smoke tests and ownership boundaries exist. |

## Current State Facts

- `serverlessstrands/agentcore/agentcore.json` declares `MainAgent`, `ChatMemory`, and `MainGateway`, but `credentials` and gateway `targets` are empty.
- AWS has `github-provider`, `google-calendar-provider`, `notion-provider`, and `tavily_api_key` already in AgentCore Identity/Token Vault.
- AWS has `serverlessstrands-MainGateway` with Lambda targets `yahoo-finance` and `tavily-lamdba-tool`.
- AWS has `serverlessstrands_ChatMemory-4Q3NbO5016` with summarization, user preference, and semantic strategies matching code retrieval namespaces.
- AWS has a READY Code Interpreter resource and a READY Browser resource, but Browser is not wired into the agent. Code Interpreter is present in dirty local changes and needs to be made intentional.
- Terraform state owns frontend/backend/data/tool Lambda resources, not AgentCore Runtime/Memory/Gateway/Identity/Browser/Code Interpreter.
- Registry lookup failed with `AccessDeniedException`; treat Registry as unknown until IAM/API access is corrected.

## File Structure

Create:
- `serverlessstrands/agentcore/expected-agentcore-resources.json`: non-secret expected inventory of AgentCore resources required by this app.
- `scripts/audit_agentcore_resources.py`: read-only AWS audit that compares actual resources to the expected inventory.
- `serverlessstrands/app/MainAgent/mcp_client/config.py`: pure endpoint resolution logic for Gateway MCP.
- `serverlessstrands/app/MainAgent/tests/test_mcp_config.py`: Python tests for Gateway endpoint resolution.
- `serverlessstrands/app/MainAgent/tool_registry.py`: deterministic tool assembly with feature flags.
- `serverlessstrands/app/MainAgent/tests/test_tool_registry.py`: tests for tool registry toggles using fake factories.
- `docs/agentcore-inventory.md`: human-readable AWS actual vs repo source-of-truth report.
- `docs/smoke-tests.md`: manual and CLI smoke prompts for chat, memory, Gateway, OAuth, Code Interpreter, Browser, and A2A.
- `scripts/smoke_chat.sh`: repeatable deployed chat smoke script through the backend API.
- `scripts/observability_setup.py`: idempotent CloudWatch retention, metric filters, alarms, and dashboard setup.

Modify:
- `serverlessstrands/app/MainAgent/main.py`: delegate tool construction to `tool_registry.py`; keep entrypoint focused.
- `serverlessstrands/app/MainAgent/mcp_client/client.py`: consume `get_gateway_mcp_endpoint()`.
- `serverlessstrands/app/MainAgent/pyproject.toml`: add test dependencies and keep intentional AgentCore/Strands tool dependencies.
- `scripts/post_deploy.py`: patch runtime IAM for Memory, Code Interpreter, and Browser data-plane access.
- `README.md`: align feature status with actual code and deployed resources.
- `frontend/src/components/MessageList.tsx`: add icons for Code Interpreter and Browser tool events.
- `infra/modules/backend/main.tf`: add observability variables and tighten CORS/user auth once Cognito lands.

## Task 1: AgentCore Inventory and Drift Guard

**Priority:** P0  
**Files:**
- Create: `serverlessstrands/agentcore/expected-agentcore-resources.json`
- Create: `scripts/audit_agentcore_resources.py`
- Create: `docs/agentcore-inventory.md`
- Modify: `README.md`

- [ ] **Step 1: Create expected inventory JSON**

Use this exact non-secret baseline:

```json
{
  "account": "612529367436",
  "region": "ap-northeast-2",
  "runtime": {
    "name": "serverlessstrands_MainAgent-4l0O95618E",
    "status": "READY",
    "networkMode": "PUBLIC",
    "requiredEnv": {
      "MEMORY_ID": "serverlessstrands_ChatMemory-4Q3NbO5016",
      "MEMORY_CHATMEMORY_ID": "serverlessstrands_ChatMemory-4Q3NbO5016",
      "WORKLOAD_NAME": "serverlessstrands_MainAgent-4l0O95618E",
      "OAUTH_CALLBACK_URL": "https://d1rur2clzx2nyl.cloudfront.net/auth/callback",
      "AGENTCORE_GATEWAY_MAINGATEWAY_AUTH_TYPE": "NONE",
      "AGENTCORE_GATEWAY_MAINGATEWAY_URL": "https://serverlessstrands-maingateway-fiobtnuvkj.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp"
    }
  },
  "memory": {
    "name": "serverlessstrands_ChatMemory-4Q3NbO5016",
    "status": "ACTIVE",
    "eventExpiryDuration": 30,
    "strategies": {
      "SEMANTIC": "/users/{actorId}/facts",
      "USER_PREFERENCE": "/users/{actorId}/preferences",
      "SUMMARIZATION": "/summaries/{actorId}/{sessionId}"
    }
  },
  "gateway": {
    "name": "serverlessstrands-MainGateway",
    "status": "READY",
    "url": "https://serverlessstrands-maingateway-fiobtnuvkj.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp",
    "authorizerType": "NONE",
    "targets": {
      "yahoo-finance": "READY",
      "tavily-lamdba-tool": "READY"
    }
  },
  "identity": {
    "oauthProviders": {
      "github-provider": "READY",
      "google-calendar-provider": "READY",
      "notion-provider": "READY"
    },
    "apiKeyProviders": {
      "tavily_api_key": "MANAGED"
    },
    "workloadIdentity": "serverlessstrands_MainAgent-4l0O95618E",
    "allowedReturnUrl": "https://d1rur2clzx2nyl.cloudfront.net/auth/callback"
  },
  "sandbox": {
    "codeInterpreter": {
      "name": "serverless_strands_code_interpreter",
      "status": "READY"
    },
    "browser": {
      "name": "serverless_strands_agent_broswer_tool",
      "status": "READY"
    }
  },
  "registry": {
    "status": "UNVERIFIED_ACCESS_DENIED"
  },
  "observability": {
    "runtimeLogGroup": "/aws/bedrock-agentcore/runtimes/serverlessstrands_MainAgent-4l0O95618E-DEFAULT",
    "onlineEvaluationConfigs": []
  }
}
```

- [ ] **Step 2: Write the read-only audit script**

Create `scripts/audit_agentcore_resources.py` with this structure:

```python
#!/usr/bin/env -S uv run --with boto3 -- python
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_PATH = ROOT / "serverlessstrands" / "agentcore" / "expected-agentcore-resources.json"


def load_expected() -> dict:
    return json.loads(EXPECTED_PATH.read_text())


def client(service: str, region: str):
    return boto3.client(service, region_name=region)


def fail(msg: str, failures: list[str]) -> None:
    failures.append(msg)
    print(f"[FAIL] {msg}")


def ok(msg: str) -> None:
    print(f"[ OK ] {msg}")


def expect_equal(label: str, actual, expected, failures: list[str]) -> None:
    if actual == expected:
        ok(f"{label}: {actual}")
    else:
        fail(f"{label}: expected {expected!r}, got {actual!r}", failures)


def main() -> int:
    expected = load_expected()
    region = expected["region"]
    control = client("bedrock-agentcore-control", region)
    logs = client("logs", region)
    failures: list[str] = []

    runtimes = control.list_agent_runtimes().get("agentRuntimeSummaries", [])
    runtime = next((r for r in runtimes if r.get("agentRuntimeName") == expected["runtime"]["name"]), None)
    if not runtime:
        fail(f"runtime missing: {expected['runtime']['name']}", failures)
    else:
        runtime_id = runtime["agentRuntimeId"]
        detail = control.get_agent_runtime(agentRuntimeId=runtime_id)
        expect_equal("runtime status", detail.get("status"), expected["runtime"]["status"], failures)
        expect_equal("runtime network", detail.get("networkConfiguration", {}).get("networkMode"), expected["runtime"]["networkMode"], failures)
        env = detail.get("environmentVariables", {})
        for name, value in expected["runtime"]["requiredEnv"].items():
            expect_equal(f"runtime env {name}", env.get(name), value, failures)

    memories = control.list_memories().get("memorySummaries", [])
    memory = next((m for m in memories if m.get("id") == expected["memory"]["name"]), None)
    if not memory:
        fail(f"memory missing: {expected['memory']['name']}", failures)
    else:
        detail = control.get_memory(memoryId=memory["id"])
        expect_equal("memory status", detail.get("status"), expected["memory"]["status"], failures)
        expect_equal("memory expiry", detail.get("eventExpiryDuration"), expected["memory"]["eventExpiryDuration"], failures)
        namespaces = {
            s.get("type"): s.get("configuration", {}).get("namespace", {}).get("template")
            for s in detail.get("memoryStrategies", [])
        }
        for strategy, namespace in expected["memory"]["strategies"].items():
            expect_equal(f"memory namespace {strategy}", namespaces.get(strategy), namespace, failures)

    gateways = control.list_gateways().get("gatewaySummaries", [])
    gateway = next((g for g in gateways if g.get("name") == expected["gateway"]["name"]), None)
    if not gateway:
        fail(f"gateway missing: {expected['gateway']['name']}", failures)
    else:
        gateway_id = gateway["gatewayId"]
        detail = control.get_gateway(gatewayIdentifier=gateway_id)
        expect_equal("gateway status", detail.get("status"), expected["gateway"]["status"], failures)
        expect_equal("gateway url", detail.get("gatewayUrl"), expected["gateway"]["url"], failures)
        expect_equal("gateway auth", detail.get("authorizerType"), expected["gateway"]["authorizerType"], failures)
        targets = control.list_gateway_targets(gatewayIdentifier=gateway_id).get("items", [])
        target_status = {t.get("name"): t.get("status") for t in targets}
        for target_name, target_expected_status in expected["gateway"]["targets"].items():
            expect_equal(f"gateway target {target_name}", target_status.get(target_name), target_expected_status, failures)

    oauth = control.list_oauth2_credential_providers().get("credentialProviderSummaries", [])
    oauth_status = {p.get("name"): p.get("status") for p in oauth}
    for provider, status in expected["identity"]["oauthProviders"].items():
        expect_equal(f"oauth provider {provider}", oauth_status.get(provider), status, failures)

    api_keys = control.list_api_key_credential_providers().get("credentialProviderSummaries", [])
    api_key_sources = {p.get("name"): p.get("secretSource") for p in api_keys}
    for provider, source in expected["identity"]["apiKeyProviders"].items():
        expect_equal(f"api key provider {provider}", api_key_sources.get(provider), source, failures)

    workloads = control.list_workload_identities().get("workloadIdentitySummaries", [])
    workload = next((w for w in workloads if w.get("name") == expected["identity"]["workloadIdentity"]), None)
    if not workload:
        fail(f"workload identity missing: {expected['identity']['workloadIdentity']}", failures)
    else:
        detail = control.get_workload_identity(workloadIdentityName=workload["name"])
        urls = detail.get("allowedResourceOauth2ReturnUrls", [])
        if expected["identity"]["allowedReturnUrl"] in urls:
            ok("workload identity return URL present")
        else:
            fail(f"workload identity return URL missing: {expected['identity']['allowedReturnUrl']}", failures)

    code_interpreters = control.list_code_interpreters().get("codeInterpreterSummaries", [])
    ci = next((c for c in code_interpreters if c.get("name") == expected["sandbox"]["codeInterpreter"]["name"]), None)
    expect_equal("code interpreter status", ci.get("status") if ci else None, expected["sandbox"]["codeInterpreter"]["status"], failures)

    browsers = control.list_browsers().get("browserSummaries", [])
    browser = next((b for b in browsers if b.get("name") == expected["sandbox"]["browser"]["name"]), None)
    expect_equal("browser status", browser.get("status") if browser else None, expected["sandbox"]["browser"]["status"], failures)

    try:
        control.list_registries()
        ok("registry list access granted")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        expect_equal("registry access", code, "AccessDeniedException", failures)

    log_group = expected["observability"]["runtimeLogGroup"]
    groups = logs.describe_log_groups(logGroupNamePrefix=log_group).get("logGroups", [])
    if any(g.get("logGroupName") == log_group for g in groups):
        ok(f"log group exists: {log_group}")
    else:
        fail(f"log group missing: {log_group}", failures)

    if failures:
        print(f"\n{len(failures)} drift check(s) failed.")
        return 1
    print("\nAgentCore inventory matches expected baseline.")
    return 0


if __name__ == "__main__":
    os.environ.setdefault("AWS_REGION", "ap-northeast-2")
    sys.exit(main())
```

- [ ] **Step 3: Run the audit**

Run:

```bash
AWS_PROFILE=developer-dongik AWS_REGION=ap-northeast-2 ./scripts/audit_agentcore_resources.py
```

Expected: all core runtime, memory, gateway, identity, code interpreter, browser, and log checks print `[ OK ]`; Registry prints the known `AccessDeniedException` comparison until Registry IAM is fixed.

- [ ] **Step 4: Commit**

```bash
git add serverlessstrands/agentcore/expected-agentcore-resources.json scripts/audit_agentcore_resources.py docs/agentcore-inventory.md README.md
git commit -m "chore: add agentcore inventory drift guard"
```

## Task 2: Gateway MCP Endpoint Resolution

**Priority:** P0  
**Files:**
- Create: `serverlessstrands/app/MainAgent/mcp_client/config.py`
- Create: `serverlessstrands/app/MainAgent/tests/test_mcp_config.py`
- Modify: `serverlessstrands/app/MainAgent/mcp_client/client.py`
- Modify: `serverlessstrands/app/MainAgent/pyproject.toml`

- [ ] **Step 1: Write endpoint config tests**

```python
from mcp_client.config import get_gateway_mcp_endpoint


def test_prefers_explicit_gateway_mcp_endpoint(monkeypatch):
    monkeypatch.setenv("GATEWAY_MCP_ENDPOINT", "https://explicit.example.com/mcp")
    monkeypatch.setenv("AGENTCORE_GATEWAY_MAINGATEWAY_URL", "https://agentcore.example.com/mcp")
    assert get_gateway_mcp_endpoint() == "https://explicit.example.com/mcp"


def test_uses_agentcore_injected_gateway_url(monkeypatch):
    monkeypatch.delenv("GATEWAY_MCP_ENDPOINT", raising=False)
    monkeypatch.setenv("AGENTCORE_GATEWAY_MAINGATEWAY_URL", "https://agentcore.example.com/mcp")
    assert get_gateway_mcp_endpoint() == "https://agentcore.example.com/mcp"


def test_falls_back_to_known_gateway(monkeypatch):
    monkeypatch.delenv("GATEWAY_MCP_ENDPOINT", raising=False)
    monkeypatch.delenv("AGENTCORE_GATEWAY_MAINGATEWAY_URL", raising=False)
    assert get_gateway_mcp_endpoint() == "https://serverlessstrands-maingateway-fiobtnuvkj.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp"
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd serverlessstrands/app/MainAgent
uv run pytest tests/test_mcp_config.py -q
```

Expected: import failure because `mcp_client.config` does not exist.

- [ ] **Step 3: Add endpoint config implementation**

```python
import os

KNOWN_GATEWAY_MCP_ENDPOINT = (
    "https://serverlessstrands-maingateway-fiobtnuvkj.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp"
)


def get_gateway_mcp_endpoint() -> str:
    for name in ("GATEWAY_MCP_ENDPOINT", "AGENTCORE_GATEWAY_MAINGATEWAY_URL"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return KNOWN_GATEWAY_MCP_ENDPOINT
```

Modify `client.py`:

```python
import logging
from mcp.client.streamable_http import streamablehttp_client
from strands.tools.mcp.mcp_client import MCPClient

from mcp_client.config import get_gateway_mcp_endpoint

logger = logging.getLogger(__name__)


def get_streamable_http_mcp_client() -> MCPClient:
    """Returns an MCP Client pointing at the AgentCore Gateway."""
    return MCPClient(lambda: streamablehttp_client(get_gateway_mcp_endpoint()))
```

- [ ] **Step 4: Add pytest dependency**

In `pyproject.toml` add:

```toml
dependencies = [
    "aws-opentelemetry-distro",
    "bedrock-agentcore >= 1.9.1",
    "botocore[crt] >= 1.35.0",
    "mcp >= 1.19.0",
    "pytest >= 8.4.0",
    "strands-agents >= 1.13.0",
    "strands-agents-tools >= 0.1.0",
]
```

- [ ] **Step 5: Run tests**

```bash
cd serverlessstrands/app/MainAgent
uv run pytest tests/test_mcp_config.py -q
```

Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add serverlessstrands/app/MainAgent/mcp_client serverlessstrands/app/MainAgent/tests/test_mcp_config.py serverlessstrands/app/MainAgent/pyproject.toml serverlessstrands/app/MainAgent/uv.lock
git commit -m "fix: prefer agentcore gateway endpoint env var"
```

## Task 3: Deterministic MainAgent Tool Registry

**Priority:** P0  
**Files:**
- Create: `serverlessstrands/app/MainAgent/tool_registry.py`
- Create: `serverlessstrands/app/MainAgent/tests/test_tool_registry.py`
- Modify: `serverlessstrands/app/MainAgent/main.py`

- [ ] **Step 1: Write registry tests**

```python
from tool_registry import ToolFactorySet, build_tools


def fake_tool(name):
    def _tool():
        return name
    _tool.__name__ = name
    return _tool


def test_build_tools_adds_base_and_oauth_tools():
    factories = ToolFactorySet(
        base_tools=lambda: [fake_tool("add_numbers")],
        mcp_tools=lambda: [],
        oauth_tools=lambda: [fake_tool("github_list_repos")],
        code_interpreter_tool=lambda: None,
        browser_tools=lambda: [],
    )
    tools = build_tools(factories=factories, env={"ENABLE_OAUTH_TOOLS": "1"})
    assert [t.__name__ for t in tools] == ["add_numbers", "github_list_repos"]


def test_build_tools_can_disable_mcp_and_enable_code_interpreter():
    ci = fake_tool("code_interpreter")
    factories = ToolFactorySet(
        base_tools=lambda: [fake_tool("add_numbers")],
        mcp_tools=lambda: [fake_tool("gateway")],
        oauth_tools=lambda: [],
        code_interpreter_tool=lambda: ci,
        browser_tools=lambda: [],
    )
    tools = build_tools(
        factories=factories,
        env={"ENABLE_MCP_GATEWAY": "0", "ENABLE_CODE_INTERPRETER": "1"},
    )
    assert [t.__name__ for t in tools] == ["add_numbers", "code_interpreter"]
```

- [ ] **Step 2: Run failing tests**

```bash
cd serverlessstrands/app/MainAgent
uv run pytest tests/test_tool_registry.py -q
```

Expected: import failure because `tool_registry.py` does not exist.

- [ ] **Step 3: Create `tool_registry.py`**

```python
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Mapping


def enabled(env: Mapping[str, str], name: str, default: bool) -> bool:
    value = env.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class ToolFactorySet:
    base_tools: Callable[[], list[Any]]
    mcp_tools: Callable[[], list[Any]]
    oauth_tools: Callable[[], list[Any]]
    code_interpreter_tool: Callable[[], Any | None]
    browser_tools: Callable[[], list[Any]]


def build_tools(
    factories: ToolFactorySet,
    env: Mapping[str, str] | None = None,
) -> list[Any]:
    values = os.environ if env is None else env
    tools: list[Any] = []
    tools.extend(factories.base_tools())

    if enabled(values, "ENABLE_MCP_GATEWAY", True):
        tools.extend([tool for tool in factories.mcp_tools() if tool])

    if enabled(values, "ENABLE_OAUTH_TOOLS", True):
        tools.extend(factories.oauth_tools())

    if enabled(values, "ENABLE_CODE_INTERPRETER", True):
        code_tool = factories.code_interpreter_tool()
        if code_tool:
            tools.append(code_tool)

    if enabled(values, "ENABLE_BROWSER_TOOLS", False):
        tools.extend(factories.browser_tools())

    return tools
```

- [ ] **Step 4: Refactor `main.py` to use registry**

Keep `add_numbers`, `build_agent`, and `invoke` in `main.py`, but replace global tool appends with `ToolFactorySet` and `build_tools`. The resulting order must be base, MCP, OAuth, Code Interpreter, Browser.

- [ ] **Step 5: Run tests**

```bash
cd serverlessstrands/app/MainAgent
uv run pytest tests/test_mcp_config.py tests/test_tool_registry.py -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add serverlessstrands/app/MainAgent/main.py serverlessstrands/app/MainAgent/tool_registry.py serverlessstrands/app/MainAgent/tests/test_tool_registry.py
git commit -m "refactor: centralize main agent tool registry"
```

## Task 4: Code Interpreter Production Wiring

**Priority:** P0  
**Files:**
- Modify: `serverlessstrands/app/MainAgent/main.py`
- Modify: `scripts/post_deploy.py`
- Modify: `frontend/src/components/MessageList.tsx`
- Modify: `README.md`
- Modify: `docs/smoke-tests.md`

- [ ] **Step 1: Make Code Interpreter an intentional enabled feature**

Use the existing dependency and import:

```python
from strands_tools.code_interpreter import AgentCoreCodeInterpreter
```

Instantiate lazily through the tool registry factory so import-time failures do not break local tests:

```python
def create_code_interpreter_tool():
    code_interpreter = AgentCoreCodeInterpreter(region=REGION)
    return code_interpreter.code_interpreter
```

- [ ] **Step 2: Patch runtime IAM for Code Interpreter sessions**

Add this list to `scripts/post_deploy.py`:

```python
CODE_INTERPRETER_ACTIONS = [
    "bedrock-agentcore:StartCodeInterpreterSession",
    "bedrock-agentcore:GetCodeInterpreterSession",
    "bedrock-agentcore:ListCodeInterpreterSessions",
    "bedrock-agentcore:StopCodeInterpreterSession",
]
```

Add a second policy statement in `patch_memory_access()` named `AgentCoreSandboxAccess` with `Resource: "*"`. Keep it grouped with Browser actions in Task 6 so the post-deploy policy remains a single inline policy.

- [ ] **Step 3: Add frontend icon mapping**

In `MessageList.tsx`, add:

```ts
code_interpreter: "/tool-icons/code-interpreter.svg",
```

- [ ] **Step 4: Run local checks**

```bash
cd serverlessstrands/app/MainAgent
uv run pytest tests/test_mcp_config.py tests/test_tool_registry.py -q
cd ../../..
npm --prefix frontend run build
```

Expected: Python tests pass and frontend build succeeds.

- [ ] **Step 5: Deploy and smoke test**

```bash
AWS_PROFILE=developer-dongik AWS_REGION=ap-northeast-2 ./scripts/deploy.sh
AWS_PROFILE=developer-dongik AWS_REGION=ap-northeast-2 ./scripts/smoke_chat.sh "Use the code interpreter to compute sum(i*i for i in range(1, 101)) and explain the result."
```

Expected: stream includes a `tool_use` event for Code Interpreter and the final answer includes `338350`.

- [ ] **Step 6: Commit**

```bash
git add serverlessstrands/app/MainAgent/main.py scripts/post_deploy.py frontend/src/components/MessageList.tsx README.md docs/smoke-tests.md
git commit -m "feat: finalize agentcore code interpreter tool"
```

## Task 5: Gateway and 3LO Tool Smoke Coverage

**Priority:** P0  
**Files:**
- Create: `scripts/smoke_chat.sh`
- Modify: `docs/smoke-tests.md`
- Modify: `README.md`

- [ ] **Step 1: Create smoke script**

```bash
#!/usr/bin/env bash
set -euo pipefail

PROMPT="${1:?usage: scripts/smoke_chat.sh '<prompt>'}"
API_BASE="${API_BASE:-https://d1rur2clzx2nyl.cloudfront.net}"
USER_ID="${USER_ID:-smoke-user-$(date +%s)}"

curl -sS \
  -X POST "$API_BASE/api/chat" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg prompt "$PROMPT" --arg userId "$USER_ID" '{prompt:$prompt,userId:$userId}')" \
  | tee /tmp/serverlessstrands-smoke.sse

grep -q 'event: done' /tmp/serverlessstrands-smoke.sse
```

- [ ] **Step 2: Add smoke prompts**

Add these exact checks to `docs/smoke-tests.md`:

```markdown
## Gateway

- Finance: "Use the finance tool to get the current quote for AAPL and summarize price, currency, and market time."
- Tavily: "Use Tavily search for the latest AWS AgentCore Code Interpreter documentation and summarize the top result."

## Identity 3LO

- GitHub: "List my 5 most recently updated GitHub repositories."
- Google Calendar: "List my Google Calendar events for today."
- Notion: "Search my Notion workspace for project notes about serverless strands."

The first run for each provider should produce an authorization URL. After the popup flow completes, repeat the same prompt and verify the tool returns user data instead of another authorization URL.
```

- [ ] **Step 3: Run smoke prompts**

```bash
chmod +x scripts/smoke_chat.sh
API_BASE=https://d1rur2clzx2nyl.cloudfront.net ./scripts/smoke_chat.sh "Use the finance tool to get the current quote for AAPL and summarize price, currency, and market time."
API_BASE=https://d1rur2clzx2nyl.cloudfront.net ./scripts/smoke_chat.sh "Use Tavily search for AWS AgentCore Gateway Lambda target examples and summarize the top result."
```

Expected: each run reaches `event: done` and includes the expected gateway tool badge event.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke_chat.sh docs/smoke-tests.md README.md
git commit -m "test: add deployed agent smoke prompts"
```

## Task 6: AgentCore Browser + Nova Act Path

**Priority:** P1  
**Files:**
- Create: `serverlessstrands/app/MainAgent/browser_tools.py`
- Create: `serverlessstrands/app/MainAgent/tests/test_browser_tools.py`
- Modify: `serverlessstrands/app/MainAgent/tool_registry.py`
- Modify: `scripts/post_deploy.py`
- Modify: `frontend/src/components/MessageList.tsx`
- Modify: `docs/smoke-tests.md`

- [ ] **Step 1: Add Browser IAM actions**

Add:

```python
BROWSER_ACTIONS = [
    "bedrock-agentcore:StartBrowserSession",
    "bedrock-agentcore:GetBrowserSession",
    "bedrock-agentcore:ListBrowserSessions",
    "bedrock-agentcore:InvokeBrowser",
    "bedrock-agentcore:UpdateBrowserStream",
    "bedrock-agentcore:SaveBrowserSessionProfile",
    "bedrock-agentcore:StopBrowserSession",
]
```

- [ ] **Step 2: Implement a minimal browser screenshot tool**

Create `browser_tools.py` around the AWS data-plane APIs exposed by the local CLI model:

```python
from __future__ import annotations

import base64
import json
import os
import time
from typing import Any

import boto3
from strands import tool

REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-northeast-2"
BROWSER_IDENTIFIER = os.environ.get("BROWSER_IDENTIFIER", "serverless_strands_agent_broswer_tool-WZUiugiuPY")


def _client():
    return boto3.client("bedrock-agentcore", region_name=REGION)


@tool
def browser_screenshot() -> str:
    """Start an AgentCore Browser session and return screenshot metadata."""
    client = _client()
    session = client.start_browser_session(
        browserIdentifier=BROWSER_IDENTIFIER,
        name=f"main-agent-{int(time.time())}",
        sessionTimeoutSeconds=300,
        viewPort={"width": 1280, "height": 720},
    )
    session_id = session["sessionId"]
    result = client.invoke_browser(
        browserIdentifier=BROWSER_IDENTIFIER,
        sessionId=session_id,
        action={"screenshot": {"format": "PNG"}},
    )
    client.stop_browser_session(
        browserIdentifier=BROWSER_IDENTIFIER,
        sessionId=session_id,
    )
    screenshot = result.get("result", {}).get("screenshot", {})
    data = screenshot.get("data", b"")
    if isinstance(data, bytes):
        size = len(data)
    else:
        size = len(base64.b64decode(data)) if data else 0
    return json.dumps({"sessionId": session_id, "status": screenshot.get("status"), "pngBytes": size})


browser_tools = [browser_screenshot]
```

- [ ] **Step 3: Enable through registry**

Set `ENABLE_BROWSER_TOOLS=1` only after the deployed smoke passes. Until then, Browser remains opt-in to avoid creating sessions on accidental prompts.

- [ ] **Step 4: Add frontend icon**

```ts
browser_screenshot: "/tool-icons/browser-automation.png",
```

- [ ] **Step 5: Smoke test**

```bash
AWS_PROFILE=developer-dongik AWS_REGION=ap-northeast-2 ./scripts/deploy.sh
ENABLE_BROWSER_TOOLS=1 API_BASE=https://d1rur2clzx2nyl.cloudfront.net ./scripts/smoke_chat.sh "Use the browser screenshot tool and report the screenshot byte size."
```

Expected: answer reports `status: SUCCESS` and `pngBytes` greater than `1000`.

- [ ] **Step 6: Commit**

```bash
git add serverlessstrands/app/MainAgent/browser_tools.py serverlessstrands/app/MainAgent/tests/test_browser_tools.py serverlessstrands/app/MainAgent/tool_registry.py scripts/post_deploy.py frontend/src/components/MessageList.tsx docs/smoke-tests.md
git commit -m "feat: add agentcore browser smoke tool"
```

## Task 7: A2A Specialist Agents

**Priority:** P1  
**Files:**
- Create: `serverlessstrands/app/MainAgent/specialist_agents.py`
- Create: `serverlessstrands/app/MainAgent/tests/test_specialist_agents.py`
- Modify: `serverlessstrands/app/MainAgent/tool_registry.py`
- Modify: `README.md`
- Modify: `docs/smoke-tests.md`

- [ ] **Step 1: Define specialist manifest**

Create a manifest that is explicit and does not silently bind unrelated old runtimes:

```python
SPECIALIST_AGENTS = {
    "deep_research": {
        "displayName": "Deep Research Agent",
        "runtimeName": "serverlessstrands_DeepResearchAgent",
        "protocol": "A2A",
    },
    "code_agent": {
        "displayName": "Code Agent",
        "runtimeName": "serverlessstrands_CodeAgent",
        "protocol": "A2A",
    },
}
```

- [ ] **Step 2: Add audit checks before integration**

Extend `scripts/audit_agentcore_resources.py` to fail if `SPECIALIST_AGENTS` names are missing once this task is active. Do not wire the currently visible `a2aagentmodive_MyAgent-N9M6vdBVtf` unless the owner confirms it belongs to this product.

- [ ] **Step 3: Implement a Strands tool wrapper after runtimes exist**

Expose two tools:

```python
@tool
def ask_deep_research_agent(question: str) -> str:
    """Ask the A2A Deep Research specialist for multi-source research."""


@tool
def ask_code_agent(task: str) -> str:
    """Ask the A2A Code specialist for code-oriented implementation help."""
```

The wrapper must pass the current user ID and session ID through metadata so specialist work remains scoped to the same user.

- [ ] **Step 4: Smoke test**

```bash
API_BASE=https://d1rur2clzx2nyl.cloudfront.net ./scripts/smoke_chat.sh "Ask the deep research specialist for a short research brief on AWS AgentCore Gateway targets."
API_BASE=https://d1rur2clzx2nyl.cloudfront.net ./scripts/smoke_chat.sh "Ask the code specialist how this repo should add a new Lambda Gateway tool."
```

Expected: each run reaches `event: done` and emits a specialist tool-use event.

- [ ] **Step 5: Commit**

```bash
git add serverlessstrands/app/MainAgent/specialist_agents.py serverlessstrands/app/MainAgent/tests/test_specialist_agents.py serverlessstrands/app/MainAgent/tool_registry.py README.md docs/smoke-tests.md scripts/audit_agentcore_resources.py
git commit -m "feat: add a2a specialist agent integration"
```

## Task 8: Cognito User Auth

**Priority:** P1  
**Files:**
- Modify: `infra/modules/web/main.tf`
- Modify: `infra/modules/backend/main.tf`
- Modify: `infra/envs/dev/main.tf`
- Modify: `backend/handler.mjs`
- Modify: `frontend/src/lib/user.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/public/auth/callback/index.html`

- [ ] **Step 1: Add Cognito infrastructure**

Create a Cognito User Pool, App Client, and hosted UI callback for CloudFront. Keep local anonymous mode behind `VITE_AUTH_MODE=anonymous` for development.

- [ ] **Step 2: Backend trusts authenticated identity**

Change `handleChat()` to derive `userId` from verified JWT claims when auth is enabled. Keep the existing request body `userId` path only for local anonymous mode.

- [ ] **Step 3: Frontend stores real user ID**

Replace generated localStorage ID with the Cognito subject claim. OAuth callback must use the same subject so AgentCore Identity tokens bind to the authenticated user.

- [ ] **Step 4: Smoke test user isolation**

Run two browsers with two users. User A creates a session and authorizes GitHub. User B must not see User A sessions and must receive a fresh GitHub authorization URL.

- [ ] **Step 5: Commit**

```bash
git add infra/modules/web/main.tf infra/modules/backend/main.tf infra/envs/dev/main.tf backend/handler.mjs frontend/src/lib/user.ts frontend/src/App.tsx frontend/public/auth/callback/index.html
git commit -m "feat: add cognito user authentication"
```

## Task 9: Observability and Operational Guardrails

**Priority:** P1  
**Files:**
- Create: `scripts/observability_setup.py`
- Modify: `infra/envs/dev/variables.tf`
- Modify: `infra/modules/backend/main.tf`
- Modify: `README.md`

- [ ] **Step 1: Set log retention**

Configure retention on:

```text
/aws/lambda/serverlessstrands-dev-chat
/aws/bedrock-agentcore/runtimes/serverlessstrands_MainAgent-4l0O95618E-DEFAULT
```

Use 30 days for dev unless production requirements specify a longer value.

- [ ] **Step 2: Add alarms**

Add CloudWatch alarms for:

```text
Backend Lambda Errors > 0 for 5 minutes
Backend Lambda Duration p95 > 250000 ms for 5 minutes
AgentCore runtime log metric filter matching "[error]" or "Agent invoke failed"
OAuth completion failures matching "CompleteResourceTokenAuth failed"
```

- [ ] **Step 3: Add dashboard**

Dashboard widgets:

```text
Lambda invocations, errors, duration p95
AgentCore runtime log error count
OAuth auth_url events count
Gateway tool_use events by tool name
Memory retrieval warnings
```

- [ ] **Step 4: Commit**

```bash
git add scripts/observability_setup.py infra/envs/dev/variables.tf infra/modules/backend/main.tf README.md
git commit -m "chore: add observability setup"
```

## Task 10: Registry Access Decision

**Priority:** P2  
**Files:**
- Modify: `scripts/audit_agentcore_resources.py`
- Modify: `docs/agentcore-inventory.md`
- Modify: `README.md`

- [ ] **Step 1: Fix IAM/API access**

Use an IAM principal with permission for:

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock-agentcore:ListRegistries",
    "bedrock-agentcore:GetRegistry",
    "bedrock-agentcore:ListRegistryRecords",
    "bedrock-agentcore:GetRegistryRecord",
    "bedrock-agentcore:SearchRegistryRecords"
  ],
  "Resource": "*"
}
```

- [ ] **Step 2: Re-run registry inventory**

```bash
AWS_PROFILE=developer-dongik AWS_REGION=ap-northeast-2 aws bedrock-agentcore-control list-registries
```

Expected: JSON list response. If the list is empty, document Registry as not provisioned for this app. If records exist, add expected names to `expected-agentcore-resources.json`.

- [ ] **Step 3: Commit**

```bash
git add scripts/audit_agentcore_resources.py docs/agentcore-inventory.md README.md serverlessstrands/agentcore/expected-agentcore-resources.json
git commit -m "chore: document agentcore registry state"
```

## Task 11: Expansion Tools

**Priority:** P2  
**Files:**
- Create per tool under `serverlessstrands/app/MainAgent/oauth_tools/` or `tools/<tool-name>/`
- Modify: `serverlessstrands/app/MainAgent/tool_registry.py`
- Modify: `frontend/src/components/MessageList.tsx`
- Modify: `docs/smoke-tests.md`

- [ ] **Step 1: Gmail 3LO**

Provider name should be `gmail-provider`. Add read-only search/list tools first:

```text
gmail_search_messages(query: str, max_results: int = 10)
gmail_get_message(message_id: str)
```

- [ ] **Step 2: Telegram mobile channel**

Implement as a separate ingress Lambda that writes to the same backend chat path or invokes AgentCore Runtime directly with the same `userId` rules after Cognito lands.

- [ ] **Step 3: MS Office tools**

Use Microsoft Graph OAuth provider and start with OneDrive file search plus Outlook calendar read. Do not add Word/PowerPoint/Excel mutation until read flows pass.

- [ ] **Step 4: Speech model**

Add speech only after chat auth and user identity are stable, because audio artifacts need per-user storage and retention rules.

## Task 12: CI/CD and Production Hardening

**Priority:** P2  
**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy-dev.yml`
- Modify: `infra/modules/backend/main.tf`
- Modify: `infra/modules/web/main.tf`
- Modify: `README.md`

- [ ] **Step 1: CI**

Run:

```bash
npm --prefix frontend run build
cd serverlessstrands/app/MainAgent && uv run pytest tests -q
cd ../../../serverlessstrands && agentcore validate
cd ../infra/envs/dev && terraform fmt -check && terraform validate
```

- [ ] **Step 2: Deploy workflow**

Build frontend, backend image, tool Lambda images, run Terraform, run AgentCore deploy, run post-deploy IAM patcher, run audit, then run smoke prompts.

- [ ] **Step 3: Production hardening**

Add WAF on CloudFront, rate limiting at the API layer, tighter Lambda Function URL CORS, CloudFront origin protection, log retention, and alarms from Task 9.

## Recommended Execution Order

1. Task 1: AgentCore inventory and drift guard.
2. Task 2: Gateway MCP endpoint resolution.
3. Task 3: Deterministic MainAgent tool registry.
4. Task 4: Code Interpreter production wiring.
5. Task 5: Gateway and 3LO smoke coverage.
6. Task 9: Observability and operational guardrails.
7. Task 6: Browser + Nova Act path.
8. Task 7: A2A specialist agents.
9. Task 8: Cognito user auth.
10. Task 10: Registry access decision.
11. Task 11: Expansion tools.
12. Task 12: CI/CD and production hardening.

## Completion Definition

The service is considered complete for the supplied architecture when:

- `scripts/audit_agentcore_resources.py` passes except for explicitly documented optional resources.
- `agentcore validate` passes from `serverlessstrands/`.
- `npm --prefix frontend run build` passes.
- `uv run pytest tests -q` passes in `serverlessstrands/app/MainAgent`.
- Smoke prompts pass for chat, memory recall, Yahoo Finance, Tavily, GitHub, Google Calendar, Notion, Code Interpreter, Browser, and A2A specialists.
- README feature status matches actual deployed behavior, not just existing AWS resources.

## Self-Review

- Spec coverage: The plan covers Memory, Gateway, Identity 3LO, Observability, Registry verification, Code Interpreter, Browser, A2A, frontend/backend user layer, and expansion items shown in the architecture.
- Placeholder scan: No task relies on unnamed future files or undefined owners. Registry is explicitly marked as access-blocked and has a concrete IAM/API resolution path.
- Type consistency: Python helper names, env var names, and tool names match the existing repo conventions and observed AgentCore env vars.
