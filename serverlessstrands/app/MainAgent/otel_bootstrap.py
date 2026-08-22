"""Resolve Langfuse credentials from Secrets Manager, then exec the real entrypoint.

Why this exists:
  `opentelemetry-instrument` reads OTEL_EXPORTER_OTLP_* once, at process start,
  before any of our code imports. Strands also decides how to serialize tool
  calls based on the endpoint: `strands.telemetry.tracer.Tracer.is_langfuse`
  checks OTEL_EXPORTER_OTLP_ENDPOINT for the substring "langfuse", and only then
  writes tool input/output as span *attributes* (which Langfuse renders) instead
  of span *events* (which it does not). Both reads happen too early for main.py
  to influence, so the credentials have to be in the environment before exec.

  Keeping the secret out of `agentcore.json` matters because that file is
  committed to git.

Failure mode:
  Telemetry must never take the agent down. If the secret is missing or
  unreadable we log loudly and exec anyway — the agent runs untraced.
"""

from __future__ import annotations

import base64
import json
import os
import sys

TARGET_ARGV = ["opentelemetry-instrument", "python", "-m", "main"]

# This project's Langfuse org lives in the Japan region (closest to ap-northeast-2).
# Only used when the secret omits "host".
DEFAULT_HOST = "https://jp.cloud.langfuse.com"
DEFAULT_SERVICE_NAME = "serverlessstrands-mainagent"

# Comma-separated regexes, matched with re.search against the request path.
# Anchored so it cannot swallow unrelated routes.
EXCLUDED_URLS = "/ping$"

# The agent streams its reply over SSE, and the ASGI instrumentation emits one
# "http send" span per chunk — ~70 spans for a single answer, on top of the
# "POST /invocations" server span. There is no env var to drop send/receive
# spans (exclude_spans is a constructor arg the Starlette instrumentor does not
# expose), so we disable the HTTP instrumentation outright. Nothing of value is
# lost: Strands emits its own invoke_agent/tool/generation spans from its own
# tracer, and botocore stays enabled so AgentCore Memory calls remain visible.
# urllib3 is dropped because it duplicates the botocore spans.
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

    # AgentCore health-checks GET /ping every ~2s per container. Left alone the
    # FastAPI instrumentation traces every one of them, which drowns out real
    # agent traces and burns the Langfuse quota (~40k spans/day per container
    # against a 50k/month free tier). The distro normally suppresses this via
    # AGENT_OBSERVABILITY_ENABLED, which we turned off along with ADOT.
    # Read at instrumentation import time, so it must be set before exec.
    os.environ.setdefault("OTEL_PYTHON_EXCLUDED_URLS", EXCLUDED_URLS)
    os.environ.setdefault("OTEL_PYTHON_DISABLED_INSTRUMENTATIONS", DISABLED_INSTRUMENTATIONS)

    print(f"[otel_bootstrap] exporting traces to {host}", file=sys.stderr)
    return True


def main() -> None:
    try:
        configure_langfuse_export()
    except Exception as exc:  # noqa: BLE001 - never block agent startup on telemetry
        print(f"[otel_bootstrap] tracing setup failed ({exc}) — continuing", file=sys.stderr)

    os.execvp(TARGET_ARGV[0], TARGET_ARGV)


if __name__ == "__main__":
    main()
