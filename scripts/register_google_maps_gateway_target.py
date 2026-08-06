#!/usr/bin/env -S uv run --with boto3 --with botocore -- python
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

AWS_CONFIG = Config(
    retries={"total_max_attempts": 3, "mode": "standard"},
    connect_timeout=5,
    read_timeout=20,
)
GATEWAY_LAMBDA_POLICY_NAME = "AllowGoogleMapsLambdaInvoke"


def load_schema(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text())
    if not isinstance(data, list):
        raise ValueError(f"Gateway tool schema must be a JSON list: {path}")
    return data


def list_items(client: Any, operation: str, result_key: str, **kwargs: Any) -> list[dict[str, Any]]:
    if client.can_paginate(operation):
        paginator = client.get_paginator(operation)
        items: list[dict[str, Any]] = []
        for page in paginator.paginate(**kwargs):
            items.extend(page.get(result_key, []))
        return items
    response = getattr(client, operation)(**kwargs)
    return response.get(result_key, [])


def find_gateway(client: Any, gateway_name: str) -> dict[str, Any]:
    for gateway in list_items(client, "list_gateways", "items"):
        if gateway.get("name") == gateway_name or gateway.get("gatewayName") == gateway_name:
            return gateway
    raise RuntimeError(f"Gateway not found: {gateway_name}")


def role_name_from_arn(role_arn: str) -> str:
    return role_arn.rsplit("/", 1)[-1]


def invoke_policy_name(target_name: str) -> str:
    words = [word for word in re.split(r"[^A-Za-z0-9]+", target_name) if word]
    suffix = "".join(word[:1].upper() + word[1:] for word in words)
    return f"Allow{suffix}LambdaInvoke" if suffix else GATEWAY_LAMBDA_POLICY_NAME


def ensure_gateway_lambda_invoke(
    control_client: Any,
    iam_client: Any,
    gateway_id: str,
    lambda_arn: str,
    target_name: str,
) -> None:
    gateway = control_client.get_gateway(gatewayIdentifier=gateway_id)
    role_arn = gateway.get("roleArn")
    if not role_arn:
        raise RuntimeError(f"Gateway roleArn not found: {gateway_id}")

    policy_name = invoke_policy_name(target_name)

    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "lambda:InvokeFunction",
                "Resource": lambda_arn,
            }
        ],
    }
    iam_client.put_role_policy(
        RoleName=role_name_from_arn(role_arn),
        PolicyName=policy_name,
        PolicyDocument=json.dumps(policy),
    )
    print(f"patched gateway role invoke policy: {policy_name}")


def find_target(client: Any, gateway_id: str, target_name: str) -> dict[str, Any] | None:
    targets = list_items(
        client,
        "list_gateway_targets",
        "items",
        gatewayIdentifier=gateway_id,
    )
    for target in targets:
        if target.get("name") == target_name:
            return target
    return None


def target_config(lambda_arn: str, schema: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "mcp": {
            "lambda": {
                "lambdaArn": lambda_arn,
                "toolSchema": {"inlinePayload": schema},
            }
        }
    }


def lambda_credential_provider_config() -> list[dict[str, str]]:
    return [{"credentialProviderType": "GATEWAY_IAM_ROLE"}]


def upsert_target(
    client: Any,
    gateway_id: str,
    target_name: str,
    lambda_arn: str,
    schema: list[dict[str, Any]],
) -> str:
    config = target_config(lambda_arn, schema)
    existing = find_target(client, gateway_id, target_name)
    if existing:
        client.update_gateway_target(
            gatewayIdentifier=gateway_id,
            targetId=existing["targetId"],
            name=target_name,
            description="Google Maps Platform tools",
            targetConfiguration=config,
            credentialProviderConfigurations=lambda_credential_provider_config(),
        )
        return f"updated {target_name}"

    client.create_gateway_target(
        gatewayIdentifier=gateway_id,
        name=target_name,
        description="Google Maps Platform tools",
        targetConfiguration=config,
        credentialProviderConfigurations=lambda_credential_provider_config(),
    )
    return f"created {target_name}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create or update the Google Maps AgentCore Gateway target."
    )
    parser.add_argument("--profile", default="developer-dongik")
    parser.add_argument("--region", default="ap-northeast-2")
    parser.add_argument("--gateway-name", default="serverlessstrands-MainGateway")
    parser.add_argument("--target-name", default="google-maps")
    parser.add_argument("--lambda-arn", required=True)
    parser.add_argument(
        "--schema",
        type=Path,
        default=Path("tools/google-maps/tool-schema.json"),
    )
    args = parser.parse_args()

    try:
        session = boto3.Session(profile_name=args.profile, region_name=args.region)
        client = session.client(
            "bedrock-agentcore-control",
            region_name=args.region,
            config=AWS_CONFIG,
        )
        iam_client = session.client("iam", config=AWS_CONFIG)
        gateway = find_gateway(client, args.gateway_name)
        schema = load_schema(args.schema)
        ensure_gateway_lambda_invoke(
            control_client=client,
            iam_client=iam_client,
            gateway_id=gateway["gatewayId"],
            lambda_arn=args.lambda_arn,
            target_name=args.target_name,
        )
        result = upsert_target(
            client=client,
            gateway_id=gateway["gatewayId"],
            target_name=args.target_name,
            lambda_arn=args.lambda_arn,
            schema=schema,
        )
        print(result)
        return 0
    except (BotoCoreError, ClientError, RuntimeError, ValueError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
