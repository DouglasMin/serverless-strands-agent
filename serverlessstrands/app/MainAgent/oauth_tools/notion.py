import urllib.request
import json
from typing import Any

from strands import tool
from oauth_tools import get_oauth_token, auth_url_queue

PROVIDER_NAME = "notion-provider"
SCOPES = []
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"


def _notion_request(path: str, token: str, method: str = "GET", body: Any = None) -> Any:
    url = f"{NOTION_API}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _get_token_or_auth_url() -> tuple[str | None, str | None]:
    result = get_oauth_token(PROVIDER_NAME, SCOPES)
    if "token" in result:
        return result["token"], None
    if "auth_url" in result:
        return None, result["auth_url"]
    return None, None


def _handle_auth(auth_url: str, provider: str = "Notion") -> str:
    auth_url_queue.put_nowait(auth_url)
    return f"{provider} authorization required. A login popup has been sent to the user. Please wait for them to complete authorization and try again."


def _extract_title(item: dict) -> str:
    obj_type = item.get("object")
    if obj_type == "page":
        props = item.get("properties", {})
        for prop in props.values():
            if prop.get("type") == "title":
                title_parts = prop.get("title", [])
                return "".join(t.get("plain_text", "") for t in title_parts)
    elif obj_type == "database":
        title_parts = item.get("title", [])
        return "".join(t.get("plain_text", "") for t in title_parts)
    return ""


def _extract_property_value(prop: dict) -> Any:
    """Extract a human-readable value from a Notion property object."""
    ptype = prop.get("type", "")
    if ptype == "title":
        return "".join(t.get("plain_text", "") for t in prop.get("title", []))
    if ptype == "rich_text":
        return "".join(t.get("plain_text", "") for t in prop.get("rich_text", []))
    if ptype == "number":
        return prop.get("number")
    if ptype == "select":
        sel = prop.get("select")
        return sel.get("name") if sel else None
    if ptype == "multi_select":
        return [s.get("name") for s in prop.get("multi_select", [])]
    if ptype == "status":
        st = prop.get("status")
        return st.get("name") if st else None
    if ptype == "date":
        d = prop.get("date")
        if not d:
            return None
        start = d.get("start", "")
        end = d.get("end")
        return f"{start} → {end}" if end else start
    if ptype == "checkbox":
        return prop.get("checkbox")
    if ptype == "url":
        return prop.get("url")
    if ptype == "email":
        return prop.get("email")
    if ptype == "phone_number":
        return prop.get("phone_number")
    if ptype == "people":
        return [p.get("name", p.get("id", "")) for p in prop.get("people", [])]
    if ptype == "relation":
        return [r.get("id") for r in prop.get("relation", [])]
    if ptype == "formula":
        f = prop.get("formula", {})
        return f.get(f.get("type", ""), None)
    if ptype == "rollup":
        r = prop.get("rollup", {})
        return r.get(r.get("type", ""), None)
    if ptype == "created_time":
        return prop.get("created_time")
    if ptype == "last_edited_time":
        return prop.get("last_edited_time")
    if ptype == "created_by":
        return prop.get("created_by", {}).get("name")
    if ptype == "last_edited_by":
        return prop.get("last_edited_by", {}).get("name")
    if ptype == "files":
        return [f.get("name", f.get("external", {}).get("url", "")) for f in prop.get("files", [])]
    return None


@tool
def notion_search(query: str, max_results: int = 10) -> str:
    """Search Notion pages and databases by title or content."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Notion token. Please try again later."

    data = _notion_request(
        "/search",
        token,
        method="POST",
        body={"query": query, "page_size": min(max_results, 20)},
    )
    results = []
    for item in data.get("results", []):
        results.append({
            "type": item.get("object"),
            "title": _extract_title(item) or "(untitled)",
            "id": item["id"],
            "url": item.get("url", ""),
            "last_edited": item.get("last_edited_time"),
        })
    return json.dumps(results, indent=2)


@tool
def notion_get_page(page_id: str) -> str:
    """Get content blocks of a Notion page by its ID."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Notion token. Please try again later."

    blocks = _notion_request(f"/blocks/{page_id}/children?page_size=100", token)
    results = []
    for block in blocks.get("results", []):
        block_type = block.get("type", "")
        content = block.get(block_type, {})
        rich_text = content.get("rich_text", [])
        text = "".join(t.get("plain_text", "") for t in rich_text)
        if text:
            results.append({"type": block_type, "text": text})
    return json.dumps(results, indent=2)


@tool
def notion_get_database(database_id: str) -> str:
    """Get a Notion database schema — shows all property names, types, and options."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Notion token. Please try again later."

    data = _notion_request(f"/databases/{database_id}", token)
    title_parts = data.get("title", [])
    title = "".join(t.get("plain_text", "") for t in title_parts)

    properties = {}
    for name, prop in data.get("properties", {}).items():
        info: dict[str, Any] = {"type": prop.get("type", "")}
        if prop.get("type") == "select":
            info["options"] = [o.get("name") for o in prop.get("select", {}).get("options", [])]
        elif prop.get("type") == "multi_select":
            info["options"] = [o.get("name") for o in prop.get("multi_select", {}).get("options", [])]
        elif prop.get("type") == "status":
            info["options"] = [o.get("name") for o in prop.get("status", {}).get("options", [])]
            info["groups"] = [g.get("name") for g in prop.get("status", {}).get("groups", [])]
        properties[name] = info

    return json.dumps({"title": title or "(untitled)", "id": data["id"], "properties": properties}, indent=2)


@tool
def notion_query_database(
    database_id: str,
    filter_json: str = "",
    sorts_json: str = "",
    max_results: int = 20,
) -> str:
    """Query a Notion database with optional filter and sort.

    filter_json: JSON string of a Notion filter object (see Notion API docs). Leave empty for no filter.
    sorts_json: JSON string of a Notion sorts array. Leave empty for default sort.
    max_results: Maximum number of results to return (max 100).

    Example filter_json: {"property": "Status", "status": {"equals": "In Progress"}}
    Example sorts_json: [{"property": "Due Date", "direction": "ascending"}]
    """
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Notion token. Please try again later."

    body: dict[str, Any] = {"page_size": min(max_results, 100)}
    if filter_json:
        body["filter"] = json.loads(filter_json)
    if sorts_json:
        body["sorts"] = json.loads(sorts_json)

    data = _notion_request(f"/databases/{database_id}/query", token, method="POST", body=body)
    results = []
    for page in data.get("results", []):
        row: dict[str, Any] = {"id": page["id"], "url": page.get("url", "")}
        for name, prop in page.get("properties", {}).items():
            val = _extract_property_value(prop)
            if val is not None and val != "" and val != []:
                row[name] = val
        results.append(row)
    return json.dumps(results, indent=2, ensure_ascii=False)


@tool
def notion_list_comments(page_id: str, max_results: int = 20) -> str:
    """List comments on a Notion page or block."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Notion token. Please try again later."

    data = _notion_request(
        f"/comments?block_id={page_id}&page_size={min(max_results, 100)}",
        token,
    )
    results = []
    for comment in data.get("results", []):
        rich_text = comment.get("rich_text", [])
        text = "".join(t.get("plain_text", "") for t in rich_text)
        results.append({
            "id": comment["id"],
            "text": text,
            "created_by": comment.get("created_by", {}).get("name", ""),
            "created_time": comment.get("created_time"),
        })
    return json.dumps(results, indent=2, ensure_ascii=False)


@tool
def notion_list_users() -> str:
    """List all users in the Notion workspace."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Notion token. Please try again later."

    data = _notion_request("/users?page_size=100", token)
    results = []
    for user in data.get("results", []):
        results.append({
            "id": user["id"],
            "name": user.get("name", ""),
            "type": user.get("type", ""),
            "email": user.get("person", {}).get("email") if user.get("type") == "person" else None,
        })
    return json.dumps(results, indent=2, ensure_ascii=False)


notion_tools = [
    notion_search,
    notion_get_page,
    notion_get_database,
    notion_query_database,
    notion_list_comments,
    notion_list_users,
]
