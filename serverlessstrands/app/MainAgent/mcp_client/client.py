import logging
from mcp.client.streamable_http import streamablehttp_client
from strands.tools.mcp.mcp_client import MCPClient

from mcp_client.config import get_gateway_mcp_endpoint

logger = logging.getLogger(__name__)


def get_streamable_http_mcp_client() -> MCPClient:
    """Returns an MCP Client pointing at the AgentCore Gateway."""
    return MCPClient(lambda: streamablehttp_client(get_gateway_mcp_endpoint()))
