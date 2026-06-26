"""
Tavily Search Tool Lambda — AgentCore Gateway target
Provides web search via Tavily API. API key is fetched from Secrets Manager.
"""
import json
import logging
import os
import urllib.request
from typing import Any

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DELIMITER = "___"
TAVILY_API_URL = "https://api.tavily.com/search"
SECRET_ARN = os.environ.get(
    "TAVILY_SECRET_ARN",
    "arn:aws:secretsmanager:ap-northeast-2:612529367436:secret:bedrock-agentcore-identity!default/apikey/tavily_api_key-a1d4d3b1-bTZXKX",
)
REGION = os.environ.get("AWS_REGION", "ap-northeast-2")

_cached_api_key: str | None = None


def _get_api_key() -> str:
    global _cached_api_key
    if _cached_api_key:
        return _cached_api_key

    client = boto3.client("secretsmanager", region_name=REGION)
    resp = client.get_secret_value(SecretId=SECRET_ARN)
    secret = json.loads(resp["SecretString"])
    _cached_api_key = secret["api_key_value"]
    return _cached_api_key


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    logger.info("event=%s", json.dumps(event))

    tool_name = _extract_tool_name(context)
    logger.info("tool=%s", tool_name)

    router: dict[str, Any] = {
        "TavilySearchPost": tavily_search,
        "TavilySearchExtract": tavily_extract,
    }

    handler_fn = router.get(tool_name)
    if not handler_fn:
        return _error(f"Unknown tool: {tool_name}")

    try:
        return handler_fn(event)
    except Exception:
        logger.error("tool=%s unexpected_error", tool_name, exc_info=True)
        return _error("An internal error occurred")


def _extract_tool_name(context: Any) -> str:
    try:
        raw = context.client_context.custom["bedrockAgentCoreToolName"]
        if DELIMITER in raw:
            return raw[raw.index(DELIMITER) + len(DELIMITER):]
        return raw
    except (AttributeError, KeyError, TypeError):
        return "unknown"


def tavily_search(params: dict[str, Any]) -> dict[str, Any]:
    """Web search via Tavily API."""
    query = params.get("query", "").strip()
    if not query:
        return _error("query is required")

    api_key = _get_api_key()

    body = {
        "api_key": api_key,
        "query": query,
        "max_results": min(int(params.get("max_results", 5)), 10),
        "include_answer": params.get("include_answer", True),
        "search_depth": params.get("search_depth", "basic"),
    }

    if params.get("include_domains"):
        body["include_domains"] = params["include_domains"]
    if params.get("exclude_domains"):
        body["exclude_domains"] = params["exclude_domains"]

    data = json.dumps(body).encode()
    req = urllib.request.Request(
        TAVILY_API_URL,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read())

    lines = []
    if result.get("answer"):
        lines.append(f"**Answer:** {result['answer']}\n")

    for item in result.get("results", []):
        title = item.get("title", "")
        url = item.get("url", "")
        content = item.get("content", "")[:300]
        lines.append(f"- **{title}**\n  {url}\n  {content}\n")

    return _ok("\n".join(lines) if lines else "No results found.")


def tavily_extract(params: dict[str, Any]) -> dict[str, Any]:
    """Extract content from URLs via Tavily API."""
    urls = params.get("urls", [])
    if not urls:
        return _error("urls (array) is required")

    api_key = _get_api_key()

    body = {
        "api_key": api_key,
        "urls": urls if isinstance(urls, list) else [urls],
    }

    data = json.dumps(body).encode()
    req = urllib.request.Request(
        "https://api.tavily.com/extract",
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())

    lines = []
    for item in result.get("results", []):
        url = item.get("url", "")
        content = item.get("raw_content", "")[:1000]
        lines.append(f"**{url}**\n{content}\n")

    return _ok("\n".join(lines) if lines else "No content extracted.")


def _ok(text: str) -> dict[str, Any]:
    return {
        "statusCode": 200,
        "body": json.dumps({"content": [{"type": "text", "text": text}]}),
    }


def _error(msg: str) -> dict[str, Any]:
    logger.error("error_response: %s", msg)
    return {
        "statusCode": 400,
        "body": json.dumps({"error": msg}),
    }
