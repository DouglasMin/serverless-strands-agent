import logging
import os

from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client
from strands.tools.mcp.mcp_client import MCPClient

from mcp_client.config import get_gateway_mcp_endpoint

logger = logging.getLogger(__name__)

# SigV4 service name for AgentCore Gateway (AWS_IAM inbound auth).
GATEWAY_SIGNING_SERVICE = "bedrock-agentcore"


def _region() -> str:
    return os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-northeast-2"


def gateway_transport():
    """SigV4-signed streamable HTTP transport, signed with the runtime role's credentials."""
    return aws_iam_streamablehttp_client(
        endpoint=get_gateway_mcp_endpoint(),
        aws_region=_region(),
        aws_service=GATEWAY_SIGNING_SERVICE,
    )


def get_streamable_http_mcp_client() -> MCPClient:
    """Returns an MCP Client pointing at the AgentCore Gateway."""
    return MCPClient(gateway_transport)
