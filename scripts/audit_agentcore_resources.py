#!/usr/bin/env -S uv run --with boto3 --with botocore -- python
from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXPECTED_PATH = (
    ROOT / "serverlessstrands" / "agentcore" / "expected-agentcore-resources.json"
)

AWS_CONFIG = Config(
    retries={"total_max_attempts": 3, "mode": "standard"},
    connect_timeout=5,
    read_timeout=20,
)


class Audit:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.warnings: list[str] = []

    def ok(self, message: str) -> None:
        print(f"[ OK ] {message}")

    def warn(self, message: str) -> None:
        self.warnings.append(message)
        print(f"[WARN] {message}")

    def fail(self, message: str) -> None:
        self.failures.append(message)
        print(f"[FAIL] {message}")

    def expect_equal(self, label: str, actual: Any, expected: Any) -> None:
        if actual == expected:
            self.ok(f"{label}: {actual}")
        else:
            self.fail(f"{label}: expected {expected!r}, got {actual!r}")

    def expect_present(self, label: str, value: Any) -> None:
        if value:
            self.ok(f"{label}: present")
        else:
            self.fail(f"{label}: missing")


def load_expected(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def create_client(session: boto3.Session, service: str, region: str):
    return session.client(service, region_name=region, config=AWS_CONFIG)


def list_items(client: Any, operation: str, result_key: str) -> list[dict[str, Any]]:
    if client.can_paginate(operation):
        paginator = client.get_paginator(operation)
        items: list[dict[str, Any]] = []
        for page in paginator.paginate():
            items.extend(page.get(result_key, []))
        return items
    response = getattr(client, operation)()
    return response.get(result_key, [])


def pick_first_present(item: dict[str, Any], keys: Sequence[str]) -> Any:
    for key in keys:
        value = item.get(key)
        if value is not None:
            return value
    return None


def find_by_any_name(items: Iterable[dict[str, Any]], expected_name: str) -> dict[str, Any] | None:
    for item in items:
        names = (
            item.get("name"),
            item.get("id"),
            item.get("agentRuntimeId"),
            item.get("agentRuntimeName"),
            item.get("gatewayName"),
            item.get("codeInterpreterName"),
            item.get("browserName"),
        )
        if expected_name in names:
            return item
    return None


def memory_strategy_namespaces(memory: dict[str, Any]) -> dict[str, str]:
    strategies = memory.get("strategies") or memory.get("memoryStrategies") or []
    namespaces: dict[str, str] = {}
    for strategy in strategies:
        strategy_type = strategy.get("type") or strategy.get("strategyType")
        if not strategy_type:
            continue
        namespace = (
            strategy.get("configuration", {})
            .get("namespace", {})
            .get("template")
        )
        if not namespace:
            templates = strategy.get("namespaceTemplates") or strategy.get("namespaces") or []
            if templates:
                namespace = templates[0]
        if namespace:
            namespaces[strategy_type] = namespace
    return namespaces


def target_lambda_arn(target: dict[str, Any]) -> str | None:
    return (
        target.get("targetConfiguration", {})
        .get("mcp", {})
        .get("lambda", {})
        .get("lambdaArn")
    )


def target_tool_names(target: dict[str, Any]) -> set[str]:
    inline_payload = (
        target.get("targetConfiguration", {})
        .get("mcp", {})
        .get("lambda", {})
        .get("toolSchema", {})
        .get("inlinePayload", [])
    )
    names: set[str] = set()
    if isinstance(inline_payload, list):
        for item in inline_payload:
            name = item.get("name")
            if name:
                names.add(name)
    elif isinstance(inline_payload, dict):
        for item in inline_payload.get("tools", []):
            name = item.get("name")
            if name:
                names.add(name)
    return names


def audit_runtime(control: Any, expected: dict[str, Any], audit: Audit) -> None:
    runtime_expected = expected["runtime"]
    runtimes = list_items(control, "list_agent_runtimes", "agentRuntimes")
    runtime = find_by_any_name(runtimes, runtime_expected["name"])
    if not runtime:
        audit.fail(f"runtime missing: {runtime_expected['name']}")
        return

    runtime_id = pick_first_present(runtime, ("agentRuntimeId", "id"))
    detail = control.get_agent_runtime(agentRuntimeId=runtime_id)
    audit.expect_equal("runtime status", detail.get("status"), runtime_expected["status"])
    audit.expect_equal(
        "runtime network",
        detail.get("networkConfiguration", {}).get("networkMode"),
        runtime_expected["networkMode"],
    )
    env = detail.get("environmentVariables", {})
    for name, value in runtime_expected["requiredEnv"].items():
        audit.expect_equal(f"runtime env {name}", env.get(name), value)


def audit_memory(control: Any, expected: dict[str, Any], audit: Audit) -> None:
    memory_expected = expected["memory"]
    memories = list_items(control, "list_memories", "memories")
    memory = find_by_any_name(memories, memory_expected["name"])
    if not memory:
        audit.fail(f"memory missing: {memory_expected['name']}")
        return

    memory_id = pick_first_present(memory, ("id", "name"))
    detail = control.get_memory(memoryId=memory_id).get("memory", {})
    audit.expect_equal("memory status", detail.get("status"), memory_expected["status"])
    audit.expect_equal(
        "memory expiry",
        detail.get("eventExpiryDuration"),
        memory_expected["eventExpiryDuration"],
    )
    namespaces = memory_strategy_namespaces(detail)
    for strategy, namespace in memory_expected["strategies"].items():
        audit.expect_equal(f"memory namespace {strategy}", namespaces.get(strategy), namespace)


def audit_gateway(control: Any, expected: dict[str, Any], audit: Audit) -> None:
    gateway_expected = expected["gateway"]
    gateways = list_items(control, "list_gateways", "items")
    gateway = find_by_any_name(gateways, gateway_expected["name"])
    if not gateway:
        audit.fail(f"gateway missing: {gateway_expected['name']}")
        return

    gateway_id = gateway["gatewayId"]
    detail = control.get_gateway(gatewayIdentifier=gateway_id)
    audit.expect_equal("gateway status", detail.get("status"), gateway_expected["status"])
    audit.expect_equal("gateway url", detail.get("gatewayUrl"), gateway_expected["url"])
    audit.expect_equal("gateway auth", detail.get("authorizerType"), gateway_expected["authorizerType"])

    targets = control.list_gateway_targets(gatewayIdentifier=gateway_id).get("items", [])
    target_by_name = {target.get("name"): target for target in targets}
    for target_name, target_expected in gateway_expected["targets"].items():
        target = target_by_name.get(target_name)
        if not target:
            audit.fail(f"gateway target missing: {target_name}")
            continue
        audit.expect_equal(f"gateway target {target_name} status", target.get("status"), target_expected["status"])
        target_id = target.get("targetId")
        target_detail = control.get_gateway_target(
            gatewayIdentifier=gateway_id,
            targetId=target_id,
        )
        audit.expect_equal(
            f"gateway target {target_name} lambda",
            target_lambda_arn(target_detail),
            target_expected["lambdaArn"],
        )
        actual_tools = target_tool_names(target_detail)
        for tool_name in target_expected.get("tools", []):
            if tool_name in actual_tools:
                audit.ok(f"gateway target {target_name} tool {tool_name}: present")
            else:
                audit.fail(f"gateway target {target_name} tool missing: {tool_name}")


def audit_identity(control: Any, expected: dict[str, Any], audit: Audit) -> None:
    identity_expected = expected["identity"]

    oauth = list_items(control, "list_oauth2_credential_providers", "credentialProviders")
    oauth_names = {provider.get("name") for provider in oauth}
    for provider, status in identity_expected["oauthProviders"].items():
        if provider not in oauth_names:
            audit.fail(f"oauth provider missing: {provider}")
            continue
        detail = control.get_oauth2_credential_provider(name=provider)
        audit.expect_equal(f"oauth provider {provider}", detail.get("status"), status)

    api_keys = list_items(control, "list_api_key_credential_providers", "credentialProviders")
    api_key_names = {provider.get("name") for provider in api_keys}
    for provider, source in identity_expected["apiKeyProviders"].items():
        if provider not in api_key_names:
            audit.fail(f"api key provider missing: {provider}")
            continue
        detail = control.get_api_key_credential_provider(name=provider)
        audit.expect_equal(f"api key provider {provider}", detail.get("apiKeySecretSource"), source)

    workloads = list_items(control, "list_workload_identities", "workloadIdentities")
    workload = find_by_any_name(workloads, identity_expected["workloadIdentity"])
    if not workload:
        audit.fail(f"workload identity missing: {identity_expected['workloadIdentity']}")
    else:
        detail = control.get_workload_identity(name=identity_expected["workloadIdentity"])
        urls = detail.get("allowedResourceOauth2ReturnUrls", [])
        if identity_expected["allowedReturnUrl"] in urls:
            audit.ok("workload identity return URL: present")
        else:
            audit.fail(f"workload identity return URL missing: {identity_expected['allowedReturnUrl']}")

    vault = control.get_token_vault(tokenVaultId=identity_expected["tokenVault"]["id"])
    key_type = vault.get("kmsConfiguration", {}).get("keyType")
    audit.expect_equal("token vault key type", key_type, identity_expected["tokenVault"]["keyType"])


def audit_sandbox(control: Any, expected: dict[str, Any], audit: Audit) -> None:
    sandbox_expected = expected["sandbox"]
    code_interpreters = list_items(control, "list_code_interpreters", "codeInterpreterSummaries")
    code_interpreter = find_by_any_name(code_interpreters, sandbox_expected["codeInterpreter"]["name"])
    audit.expect_equal(
        "code interpreter status",
        code_interpreter.get("status") if code_interpreter else None,
        sandbox_expected["codeInterpreter"]["status"],
    )

    browsers = list_items(control, "list_browsers", "browserSummaries")
    browser = find_by_any_name(browsers, sandbox_expected["browser"]["name"])
    audit.expect_equal(
        "browser status",
        browser.get("status") if browser else None,
        sandbox_expected["browser"]["status"],
    )


def audit_registry(control: Any, expected: dict[str, Any], audit: Audit) -> None:
    registry_expected = expected["registry"]
    try:
        registries = list_items(control, "list_registries", "registries")
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if registry_expected["status"] == "UNVERIFIED_ACCESS_DENIED" and code == "AccessDeniedException":
            audit.warn("registry access denied; recorded as currently unverified")
            return
        audit.fail(f"registry list failed: {code}")
        return
    audit.ok(f"registry list access granted; registries={len(registries)}")


def audit_observability(logs: Any, control: Any, expected: dict[str, Any], audit: Audit) -> None:
    observability_expected = expected["observability"]
    log_group = observability_expected["runtimeLogGroup"]
    groups = logs.describe_log_groups(logGroupNamePrefix=log_group).get("logGroups", [])
    if any(group.get("logGroupName") == log_group for group in groups):
        audit.ok(f"runtime log group exists: {log_group}")
    else:
        audit.fail(f"runtime log group missing: {log_group}")

    configs = list_items(control, "list_online_evaluation_configs", "onlineEvaluationConfigs")
    audit.expect_equal(
        "online evaluation configs",
        [config.get("name") for config in configs],
        observability_expected["onlineEvaluationConfigs"],
    )


def run_audit(expected: dict[str, Any], profile: str | None) -> Audit:
    region = expected["region"]
    session = boto3.Session(profile_name=profile, region_name=region) if profile else boto3.Session(region_name=region)
    control = create_client(session, "bedrock-agentcore-control", region)
    logs = create_client(session, "logs", region)
    audit = Audit()

    audit_runtime(control, expected, audit)
    audit_memory(control, expected, audit)
    audit_gateway(control, expected, audit)
    audit_identity(control, expected, audit)
    audit_sandbox(control, expected, audit)
    audit_registry(control, expected, audit)
    audit_observability(logs, control, expected, audit)
    return audit


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit AgentCore resources against the expected non-secret inventory.")
    parser.add_argument(
        "--expected",
        type=Path,
        default=DEFAULT_EXPECTED_PATH,
        help=f"Path to expected inventory JSON. Default: {DEFAULT_EXPECTED_PATH}",
    )
    parser.add_argument(
        "--profile",
        default=os.environ.get("AWS_PROFILE"),
        help="AWS profile to use. Defaults to AWS_PROFILE.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        expected = load_expected(args.expected)
        audit = run_audit(expected, args.profile)
    except (BotoCoreError, ClientError) as exc:
        print(f"Audit failed before completion: {exc}", file=sys.stderr)
        return 2

    if audit.failures:
        print(f"\n{len(audit.failures)} drift check(s) failed.")
        return 1
    if audit.warnings:
        print(f"\nAgentCore inventory matches expected baseline with {len(audit.warnings)} warning(s).")
        return 0
    print("\nAgentCore inventory matches expected baseline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
