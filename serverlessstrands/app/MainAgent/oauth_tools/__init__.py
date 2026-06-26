"""OAuth tools using AgentCore Identity direct API."""

import logging
import os
import queue
import threading
from typing import Optional

from bedrock_agentcore.services.identity import IdentityClient
from bedrock_agentcore.runtime import BedrockAgentCoreContext

auth_url_queue: queue.Queue[str] = queue.Queue()

logger = logging.getLogger(__name__)

_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-northeast-2"
_CALLBACK_URL = os.environ.get(
    "OAUTH_CALLBACK_URL", "https://d1rur2clzx2nyl.cloudfront.net/auth/callback"
)
_WORKLOAD_NAME = os.environ.get("WORKLOAD_NAME", "serverlessstrands_MainAgent-4l0O95618E")

_identity_client: Optional[IdentityClient] = None
_current_user_id: Optional[str] = None
_token_lock = threading.Lock()


def _get_identity_client() -> IdentityClient:
    global _identity_client
    if _identity_client is None:
        _identity_client = IdentityClient(_REGION)
    return _identity_client


def set_current_user(user_id: str) -> None:
    """Called from entrypoint to set the current user for token retrieval."""
    global _current_user_id
    with _token_lock:
        _current_user_id = user_id


def _get_workload_token() -> Optional[str]:
    """Get workload access token - try context first, then generate via userId."""
    token = BedrockAgentCoreContext.get_workload_access_token()
    if token:
        return token

    with _token_lock:
        user_id = _current_user_id

    if not user_id:
        logger.error("[OAuth] No user_id available for workload token generation")
        return None

    client = _get_identity_client()
    try:
        response = client.dp_client.get_workload_access_token_for_user_id(
            workloadName=_WORKLOAD_NAME,
            userId=user_id,
        )
        token = response.get("workloadAccessToken")
        if token:
            logger.info("[OAuth] Generated workload token via userId")
        return token
    except Exception as e:
        logger.error(f"[OAuth] get_workload_access_token_for_user_id failed: {e}")
        return None


def get_oauth_token(provider_name: str, scopes: list[str]) -> dict:
    """Get OAuth token from AgentCore Identity.

    Returns dict with either:
      {"token": "..."} on cache hit
      {"auth_url": "..."} when user consent needed
      {"error": "..."} on failure
    """
    workload_token = _get_workload_token()
    if not workload_token:
        return {"error": "WorkloadAccessToken not available"}

    client = _get_identity_client()
    try:
        response = client.dp_client.get_resource_oauth2_token(
            resourceCredentialProviderName=provider_name,
            scopes=scopes,
            oauth2Flow="USER_FEDERATION",
            workloadIdentityToken=workload_token,
            resourceOauth2ReturnUrl=_CALLBACK_URL,
            forceAuthentication=False,
        )
    except Exception as e:
        logger.error(f"[OAuth] get_resource_oauth2_token failed: {e}")
        return {"error": str(e)}

    if "accessToken" in response:
        return {"token": response["accessToken"]}

    if "authorizationUrl" in response:
        return {"auth_url": response["authorizationUrl"]}

    return {"error": f"Unexpected response: {response}"}
