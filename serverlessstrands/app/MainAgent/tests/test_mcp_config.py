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
    assert (
        get_gateway_mcp_endpoint()
        == "https://serverlessstrands-maingateway-fiobtnuvkj.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp"
    )
