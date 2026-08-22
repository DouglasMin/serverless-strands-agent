import os

KNOWN_GATEWAY_MCP_ENDPOINT = (
    "https://serverlessstrands-maingateway-fiobtnuvkj.gateway.bedrock-agentcore.ap-northeast-2.amazonaws.com/mcp"
)


def get_gateway_mcp_endpoint() -> str:
    """Resolve the Gateway MCP endpoint in order of precedence:
    1. Explicit GATEWAY_MCP_ENDPOINT
    2. AgentCore injected AGENTCORE_GATEWAY_MAINGATEWAY_URL
    3. Known deployed gateway endpoint fallback
    """
    for name in ("GATEWAY_MCP_ENDPOINT", "AGENTCORE_GATEWAY_MAINGATEWAY_URL"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return KNOWN_GATEWAY_MCP_ENDPOINT
