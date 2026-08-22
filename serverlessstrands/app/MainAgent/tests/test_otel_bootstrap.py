import base64

import pytest

import otel_bootstrap


OTEL_VARS = (
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_SERVICE_NAME",
    "OTEL_PYTHON_EXCLUDED_URLS",
    "OTEL_PYTHON_DISABLED_INSTRUMENTATIONS",
)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for var in OTEL_VARS + ("LANGFUSE_SECRET_ID",):
        monkeypatch.delenv(var, raising=False)


def _stub_secret(monkeypatch, secret):
    monkeypatch.setattr(otel_bootstrap, "_load_secret", lambda _id: secret)


def test_configures_otlp_export_from_secret(monkeypatch):
    monkeypatch.setenv("LANGFUSE_SECRET_ID", "serverlessstrands/langfuse")
    _stub_secret(
        monkeypatch,
        {
            "public_key": "pk-lf-test",
            "secret_key": "sk-lf-test",
            "host": "https://jp.cloud.langfuse.com",
        },
    )

    assert otel_bootstrap.configure_langfuse_export() is True

    import os

    assert (
        os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"]
        == "https://jp.cloud.langfuse.com/api/public/otel"
    )
    assert os.environ["OTEL_EXPORTER_OTLP_PROTOCOL"] == "http/protobuf"
    assert os.environ["OTEL_SERVICE_NAME"] == "serverlessstrands-mainagent"

    expected_auth = base64.b64encode(b"pk-lf-test:sk-lf-test").decode()
    headers = os.environ["OTEL_EXPORTER_OTLP_HEADERS"]
    assert f"Authorization=Basic {expected_auth}" in headers
    assert "x-langfuse-ingestion-version=4" in headers


def test_endpoint_contains_langfuse_so_strands_emits_span_attributes(monkeypatch):
    """Strands' Tracer.is_langfuse greps the endpoint for 'langfuse'.

    If it does not match, tool input/output is written as OTel events, which
    Langfuse does not render — tool calls would show up empty.
    """
    import os

    monkeypatch.setenv("LANGFUSE_SECRET_ID", "x")
    _stub_secret(monkeypatch, {"public_key": "pk", "secret_key": "sk"})

    otel_bootstrap.configure_langfuse_export()

    assert "langfuse" in os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"]


def test_trailing_slash_in_host_does_not_double_up(monkeypatch):
    import os

    monkeypatch.setenv("LANGFUSE_SECRET_ID", "x")
    _stub_secret(
        monkeypatch,
        {"public_key": "pk", "secret_key": "sk", "host": "https://us.cloud.langfuse.com/"},
    )

    otel_bootstrap.configure_langfuse_export()

    assert os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"].count("//") == 1


def test_health_checks_are_excluded_from_tracing(monkeypatch):
    """AgentCore polls GET /ping every ~2s; tracing it floods the Langfuse quota."""
    import os

    monkeypatch.setenv("LANGFUSE_SECRET_ID", "x")
    _stub_secret(monkeypatch, {"public_key": "pk", "secret_key": "sk"})

    otel_bootstrap.configure_langfuse_export()

    from opentelemetry.util.http import parse_excluded_urls

    matcher = parse_excluded_urls(os.environ["OTEL_PYTHON_EXCLUDED_URLS"])
    assert matcher.url_disabled("/ping") is True
    assert matcher.url_disabled("http://localhost:8080/ping") is True
    # Real agent traffic must still be traced.
    assert matcher.url_disabled("/invocations") is False
    assert matcher.url_disabled("/ping/subresource") is False


def test_sse_send_spans_are_disabled_but_agent_spans_kept(monkeypatch):
    """SSE streaming emits one ASGI 'http send' span per chunk (~70 per answer)."""
    import os

    monkeypatch.setenv("LANGFUSE_SECRET_ID", "x")
    _stub_secret(monkeypatch, {"public_key": "pk", "secret_key": "sk"})

    otel_bootstrap.configure_langfuse_export()

    disabled = set(os.environ["OTEL_PYTHON_DISABLED_INSTRUMENTATIONS"].split(","))
    assert {"starlette", "asgi"} <= disabled
    # botocore must stay on so AgentCore Memory calls remain visible, and
    # threading must stay on because Strands relies on it for context propagation.
    assert "botocore" not in disabled
    assert "threading" not in disabled


def test_disabled_instrumentations_are_real_entry_point_names():
    """A typo here fails silently — the instrumentation just stays enabled."""
    from importlib.metadata import entry_points

    available = {e.name for e in entry_points(group="opentelemetry_instrumentor")}
    configured = set(otel_bootstrap.DISABLED_INSTRUMENTATIONS.split(","))
    # 'asgi' has no standalone entry point; it is covered via starlette.
    unknown = configured - available - {"asgi"}
    assert not unknown, f"not real instrumentor names: {unknown}"


def test_missing_secret_id_skips_tracing_without_raising():
    assert otel_bootstrap.configure_langfuse_export() is False


def test_secret_fetch_failure_does_not_block_startup(monkeypatch, capsys):
    """Telemetry must never take the agent down."""
    monkeypatch.setenv("LANGFUSE_SECRET_ID", "x")

    def boom(_id):
        raise RuntimeError("AccessDeniedException")

    monkeypatch.setattr(otel_bootstrap, "_load_secret", boom)

    execs = []
    monkeypatch.setattr(otel_bootstrap.os, "execvp", lambda f, a: execs.append((f, a)))

    otel_bootstrap.main()

    assert execs == [
        ("opentelemetry-instrument", ["opentelemetry-instrument", "python", "-m", "main"])
    ]
    assert "continuing" in capsys.readouterr().err
