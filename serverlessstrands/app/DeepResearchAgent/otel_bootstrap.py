"""Resolve Langfuse credentials from Secrets Manager, then exec the real entrypoint for DeepResearchAgent."""

from __future__ import annotations

import base64
import json
import os
import sys

TARGET_ARGV = ["opentelemetry-instrument", "python", "-m", "main"]

DEFAULT_HOST = "https://jp.cloud.langfuse.com"
DEFAULT_SERVICE_NAME = "serverlessstrands-deepresearchagent"
EXCLUDED_URLS = "/ping$"
DISABLED_INSTRUMENTATIONS = "starlette,asgi,urllib3"


def _region() -> str:
    return (
        os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or "ap-northeast-2"
    )


def _load_secret(secret_id: str) -> dict[str, str]:
    import boto3

    client = boto3.client("secretsmanager", region_name=_region())
    payload = client.get_secret_value(SecretId=secret_id)["SecretString"]
    secret = json.loads(payload)
    if not isinstance(secret, dict):
        raise ValueError("secret must be a JSON object")
    return secret


def configure_langfuse_export() -> bool:
    """Populate OTEL_* env vars from Secrets Manager. Returns True if configured."""
    secret_id = os.environ.get("LANGFUSE_SECRET_ID")
    if not secret_id:
        print(
            "[otel_bootstrap] LANGFUSE_SECRET_ID unset — starting without tracing",
            file=sys.stderr,
        )
        return False

    try:
        secret = _load_secret(secret_id)
        public_key = secret["public_key"]
        secret_key = secret["secret_key"]
        host = secret.get("host", DEFAULT_HOST).rstrip("/")

        auth = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()

        os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"] = f"{host}/api/public/otel"
        os.environ["OTEL_EXPORTER_OTLP_HEADERS"] = (
            f"Authorization=Basic {auth},x-langfuse-ingestion-version=4"
        )
        os.environ["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf"
        os.environ.setdefault("OTEL_SERVICE_NAME", DEFAULT_SERVICE_NAME)
        os.environ.setdefault("OTEL_PYTHON_EXCLUDED_URLS", EXCLUDED_URLS)
        os.environ.setdefault("OTEL_PYTHON_DISABLED_INSTRUMENTATIONS", DISABLED_INSTRUMENTATIONS)
        return True
    except Exception as exc:
        print(
            f"[otel_bootstrap] failed to load Langfuse credentials: {exc} — continuing untraced",
            file=sys.stderr,
        )
        return False


def main() -> None:
    configure_langfuse_export()
    print(
        f"[otel_bootstrap] starting DeepResearchAgent with {TARGET_ARGV[0]}",
        file=sys.stderr,
    )
    os.execvp(TARGET_ARGV[0], TARGET_ARGV)


if __name__ == "__main__":
    main()
