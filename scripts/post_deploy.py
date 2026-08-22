#!/usr/bin/env -S uv run --with boto3 -- python
"""Post-deploy IAM fixups for resources provisioned by `agentcore deploy`.

Why this exists:
  The agentcore CDK auto-creates an IAM role for each runtime but forgets
  permissions the Strands integration needs at runtime. The 403s are silent
  (only show up as WARN lines in CloudWatch), so the agent appears to "forget"
  things instead of failing loudly.

What it patches (all idempotent — put_role_policy overwrites):
  - bedrock-agentcore:RetrieveMemoryRecords + related read APIs on every
    Memory resource for every agent runtime in the project.
  - secretsmanager:GetSecretValue on the Langfuse tracing secret, which
    otel_bootstrap.py reads at container start to configure OTLP export.
    Without it the agent still runs, but emits no traces.
  - Code Interpreter session APIs. main.py registers the code_interpreter
    tool unconditionally, but the CDK role grants none of these, so every
    call 403s after the model has already committed to the tool.

How to run:
  cd <project-root>/serverlessstrands && python ../scripts/post_deploy.py
  # or via the wrapper: ../scripts/deploy.sh
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError

POLICY_NAME = "AgentCorePostDeployFixups"

# Must match LANGFUSE_SECRET_ID in agentcore.json. Secrets Manager appends a
# random 6-char suffix to the ARN, hence the trailing wildcard.
LANGFUSE_SECRET_NAME = "serverlessstrands/langfuse"

# Session data-plane only. CreateCodeInterpreter/DeleteCodeInterpreter are
# control-plane and deliberately withheld — the runtime starts sessions against
# an existing interpreter, it does not provision them.
CODE_INTERPRETER_ACTIONS = [
    "bedrock-agentcore:StartCodeInterpreterSession",
    "bedrock-agentcore:InvokeCodeInterpreter",
    "bedrock-agentcore:StopCodeInterpreterSession",
    "bedrock-agentcore:GetCodeInterpreterSession",
    "bedrock-agentcore:ListCodeInterpreterSessions",
]

MEMORY_ACTIONS = [
    "bedrock-agentcore:RetrieveMemoryRecords",
    "bedrock-agentcore:ListMemoryRecords",
    "bedrock-agentcore:GetMemoryRecord",
    "bedrock-agentcore:ListActors",
    "bedrock-agentcore:ListSessions",
    "bedrock-agentcore:ListEvents",
    "bedrock-agentcore:GetEvent",
    "bedrock-agentcore:CreateEvent",
    "bedrock-agentcore:GetMemory",
]


def run_agentcore_status() -> dict:
    """Call `agentcore status --json` from the current dir.

    The CLI appends ANSI cursor escapes after the JSON payload, so we slice
    from the first `{` and use raw_decode to ignore trailing junk.
    """
    try:
        out = subprocess.check_output(
            ["agentcore", "status", "--json"],
            text=True,
            stderr=subprocess.PIPE,
        )
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(f"agentcore status failed:\n{exc.stderr}\n")
        sys.exit(2)
    start = out.find("{")
    if start == -1:
        sys.stderr.write(f"agentcore status produced no JSON:\n{out}\n")
        sys.exit(2)
    obj, _ = json.JSONDecoder().raw_decode(out[start:])
    return obj


def role_name_from_arn(arn: str) -> str:
    """Extract role name from an IAM role ARN."""
    return arn.split("/", 1)[1]


def collect_agent_roles(region: str, agent_runtime_arns: list[str]) -> dict[str, str]:
    """Map each agent runtime ARN to its IAM role ARN.

    The role ARN isn't in `agentcore status` output — we need to call
    GetAgentRuntime for each runtime.
    """
    client = boto3.client("bedrock-agentcore-control", region_name=region)
    roles: dict[str, str] = {}
    for arn in agent_runtime_arns:
        runtime_id = arn.rsplit("/", 1)[-1]
        try:
            resp = client.get_agent_runtime(agentRuntimeId=runtime_id)
        except (BotoCoreError, ClientError) as exc:
            sys.stderr.write(f"  ! get_agent_runtime failed for {runtime_id}: {exc}\n")
            continue
        roles[arn] = resp["roleArn"]
    return roles


_account_id_cache: str | None = None


def account_id() -> str:
    """Caller's account ID, resolved once per run."""
    global _account_id_cache
    if _account_id_cache is None:
        _account_id_cache = boto3.client("sts").get_caller_identity()["Account"]
    return _account_id_cache


def langfuse_secret_arn(region: str) -> str:
    """Build the wildcard ARN for the Langfuse tracing secret."""
    return f"arn:aws:secretsmanager:{region}:{account_id()}:secret:{LANGFUSE_SECRET_NAME}-*"


def code_interpreter_arns(region: str) -> list[str]:
    """Both interpreter flavours the runtime may target.

    strands_tools' AgentCoreCodeInterpreter defaults to the AWS-managed
    `aws.codeinterpreter.v1`, whose ARN carries the literal account segment
    `aws` rather than ours — granting only on our own account silently misses
    it. The custom prefix covers interpreters created in this account.
    """
    return [
        f"arn:aws:bedrock-agentcore:{region}:aws:code-interpreter/*",
        f"arn:aws:bedrock-agentcore:{region}:{account_id()}:code-interpreter-custom/*",
    ]


def patch_agent_role(role_arn: str, memory_arns: list[str], region: str) -> None:
    """Attach an inline policy granting Memory + tracing-secret access. Idempotent."""
    iam = boto3.client("iam")
    role_name = role_name_from_arn(role_arn)

    resources: list[str] = []
    for arn in memory_arns:
        resources.append(arn)
        resources.append(f"{arn}/*")

    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AgentCoreMemoryAccess",
                "Effect": "Allow",
                "Action": MEMORY_ACTIONS,
                "Resource": resources,
            },
            {
                "Sid": "AgentCoreCodeInterpreterAccess",
                "Effect": "Allow",
                "Action": CODE_INTERPRETER_ACTIONS,
                "Resource": code_interpreter_arns(region),
            },
            {
                "Sid": "LangfuseTracingSecretRead",
                "Effect": "Allow",
                "Action": "secretsmanager:GetSecretValue",
                "Resource": langfuse_secret_arn(region),
            },
        ],
    }

    iam.put_role_policy(
        RoleName=role_name,
        PolicyName=POLICY_NAME,
        PolicyDocument=json.dumps(policy),
    )
    print(f"  [iam] {POLICY_NAME} -> {role_name}")


def main() -> int:
    if not Path("agentcore").is_dir():
        sys.stderr.write(
            "ERROR: run this from the agentcore project root "
            "(the dir containing the `agentcore/` folder).\n"
        )
        return 1

    print("→ Reading agentcore status...")
    status = run_agentcore_status()
    if not status.get("success"):
        sys.stderr.write("ERROR: agentcore status reported success=false\n")
        sys.stderr.write(json.dumps(status, indent=2) + "\n")
        return 2

    region = status.get("targetRegion")
    resources = status.get("resources", [])
    agents = [r for r in resources if r["resourceType"] == "agent"]
    memories = [r for r in resources if r["resourceType"] == "memory"]

    print(f"  region={region}  agents={len(agents)}  memories={len(memories)}")

    if not memories:
        print("✓ No memories declared — nothing to patch.")
        return 0
    if not agents:
        print("✓ No agents declared — nothing to patch.")
        return 0

    memory_arns = [m["identifier"] for m in memories]
    agent_arns = [a["identifier"] for a in agents]

    print("→ Resolving agent role ARNs...")
    roles = collect_agent_roles(region, agent_arns)
    if not roles:
        sys.stderr.write("ERROR: could not resolve any agent role ARNs\n")
        return 3

    print("→ Patching IAM (idempotent)...")
    for runtime_arn, role_arn in roles.items():
        try:
            patch_agent_role(role_arn, memory_arns, region)
        except (BotoCoreError, ClientError) as exc:
            sys.stderr.write(f"  ! failed to patch {role_arn}: {exc}\n")
            return 4

    print("✓ Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
