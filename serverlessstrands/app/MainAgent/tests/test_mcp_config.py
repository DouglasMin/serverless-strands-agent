import mcp_client.client as client_module
from mcp_client.config import get_gateway_mcp_endpoint

TOOL_GATEWAY_URL = (
    "https://serverlessstrands-toolgateway-ika6p9dxdd.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp"
)


def test_prefers_explicit_gateway_mcp_endpoint(monkeypatch):
    monkeypatch.setenv("GATEWAY_MCP_ENDPOINT", "https://explicit.example.com/mcp")
    monkeypatch.setenv("AGENTCORE_GATEWAY_TOOLGATEWAY_URL", "https://agentcore.example.com/mcp")
    assert get_gateway_mcp_endpoint() == "https://explicit.example.com/mcp"


def test_uses_agentcore_injected_gateway_url(monkeypatch):
    monkeypatch.delenv("GATEWAY_MCP_ENDPOINT", raising=False)
    monkeypatch.setenv("AGENTCORE_GATEWAY_TOOLGATEWAY_URL", "https://agentcore.example.com/mcp")
    assert get_gateway_mcp_endpoint() == "https://agentcore.example.com/mcp"


def test_ignores_removed_legacy_main_gateway(monkeypatch):
    # The legacy MainGateway had no inbound auth; it must never be selected again.
    monkeypatch.delenv("GATEWAY_MCP_ENDPOINT", raising=False)
    monkeypatch.delenv("AGENTCORE_GATEWAY_TOOLGATEWAY_URL", raising=False)
    monkeypatch.setenv("AGENTCORE_GATEWAY_MAINGATEWAY_URL", "https://legacy.example.com/mcp")
    assert get_gateway_mcp_endpoint() == TOOL_GATEWAY_URL


def test_falls_back_to_known_gateway(monkeypatch):
    monkeypatch.delenv("GATEWAY_MCP_ENDPOINT", raising=False)
    monkeypatch.delenv("AGENTCORE_GATEWAY_TOOLGATEWAY_URL", raising=False)
    assert get_gateway_mcp_endpoint() == TOOL_GATEWAY_URL


def test_gateway_transport_signs_requests_with_sigv4(monkeypatch):
    # The Gateway uses AWS_IAM inbound auth, so an unsigned transport is rejected.
    calls = []
    monkeypatch.setattr(
        client_module,
        "aws_iam_streamablehttp_client",
        lambda **kwargs: calls.append(kwargs) or "signed-transport",
    )
    monkeypatch.setenv("GATEWAY_MCP_ENDPOINT", "https://gw.example.com/mcp")
    monkeypatch.setenv("AWS_REGION", "us-west-2")

    assert client_module.gateway_transport() == "signed-transport"
    assert calls == [
        {
            "endpoint": "https://gw.example.com/mcp",
            "aws_region": "us-west-2",
            "aws_service": "bedrock-agentcore",
        }
    ]
