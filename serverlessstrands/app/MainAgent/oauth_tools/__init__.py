"""OAuth tools using AgentCore Identity direct API."""

import logging
import os
import queue
from contextvars import ContextVar, Token
from typing import Optional

from bedrock_agentcore.services.identity import IdentityClient
from bedrock_agentcore.runtime import BedrockAgentCoreContext

logger = logging.getLogger(__name__)

_REGION = (
    os.environ.get("AWS_REGION")
    or os.environ.get("AWS_DEFAULT_REGION")
    or "ap-northeast-2"
)
_CALLBACK_URL = os.environ.get(
    "OAUTH_CALLBACK_URL", "https://d1rur2clzx2nyl.cloudfront.net/auth/callback"
)
_WORKLOAD_NAME = os.environ.get(
    "WORKLOAD_NAME",
    "serverlessstrands_MainAgent-4l0O95618E",
)

_identity_client: Optional[IdentityClient] = None
_current_user_id: ContextVar[str | None] = ContextVar(
    "current_oauth_user_id",
    default=None,
)
_auth_url_queue: ContextVar[queue.Queue[str] | None] = ContextVar(
    "auth_url_queue",
    default=None,
)
_fallback_auth_url_queue: queue.Queue[str] = queue.Queue()


class AuthUrlQueue:
    def _queue(self) -> queue.Queue[str]:
        return _auth_url_queue.get() or _fallback_auth_url_queue

    def put_nowait(self, auth_url: str) -> None:
        q = self._queue()
        with q.mutex:
            if auth_url not in q.queue:
                q.queue.append(auth_url)
                q.not_empty.notify()

    def get_nowait(self) -> str:
        return self._queue().get_nowait()

    def empty(self) -> bool:
        return self._queue().empty()


auth_url_queue = AuthUrlQueue()


def _get_identity_client() -> IdentityClient:
    global _identity_client
    if _identity_client is None:
        _identity_client = IdentityClient(_REGION)
    return _identity_client


def set_current_user(user_id: str) -> Token:
    """Called from entrypoint to set the current user for token retrieval."""
    return _current_user_id.set(user_id)


def reset_current_user(token: Token) -> None:
    _current_user_id.reset(token)


def set_auth_url_queue(url_queue: queue.Queue[str]) -> Token:
    return _auth_url_queue.set(url_queue)


def reset_auth_url_queue(token: Token) -> None:
    _auth_url_queue.reset(token)


def _get_workload_token() -> Optional[str]:
    """Get workload access token - try context first, then generate via userId."""
    token = BedrockAgentCoreContext.get_workload_access_token()
    if token:
        return token

    user_id = _current_user_id.get()
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
