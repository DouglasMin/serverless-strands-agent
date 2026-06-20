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


def patch_memory_access(role_arn: str, memory_arns: list[str]) -> None:
    """Attach an inline policy granting Memory access. Idempotent."""
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
            }
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
            patch_memory_access(role_arn, memory_arns)
        except (BotoCoreError, ClientError) as exc:
            sys.stderr.write(f"  ! failed to patch {role_arn}: {exc}\n")
            return 4

    print("✓ Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
