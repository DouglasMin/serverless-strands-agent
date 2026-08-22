import base64
import json
import urllib.parse
import urllib.request
from typing import Any

from strands import tool
from oauth_tools import get_oauth_token

PROVIDER_NAME = "github-provider"
SCOPES = ["repo", "user"]
GITHUB_API = "https://api.github.com"


def _github_request(
    path: str, token: str, method: str = "GET", body: Any = None
) -> Any:
    url = f"{GITHUB_API}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "ServerlessStrands-Agent",
        },
    )
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode("utf-8")
        return json.loads(content) if content else {}


def _get_token_or_auth_url() -> tuple[str | None, str | None]:
    """Returns (token, auth_url). One will be None."""
    result = get_oauth_token(PROVIDER_NAME, SCOPES)
    if "token" in result:
        return result["token"], None
    if "auth_url" in result:
        return None, result["auth_url"]
    return None, None


def _handle_auth(auth_url: str) -> str:
    from oauth_tools import auth_url_queue

    auth_url_queue.put_nowait(auth_url)
    return (
        "GitHub authorization required. A login popup has been sent to the user. "
        "Please wait for them to complete authorization and try again."
    )


@tool
def github_list_repos(max_results: int = 10) -> str:
    """List the authenticated user's GitHub repositories with names, descriptions, and URLs."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    repos = _github_request(
        f"/user/repos?sort=updated&per_page={min(max_results, 30)}", token
    )
    results = []
    for r in repos:
        results.append(
            {
                "name": r.get("full_name"),
                "description": r.get("description") or "",
                "url": r.get("html_url"),
                "language": r.get("language"),
                "stars": r.get("stargazers_count", 0),
                "forks": r.get("forks_count", 0),
                "open_issues": r.get("open_issues_count", 0),
                "updated_at": r.get("updated_at"),
            }
        )
    return json.dumps(results, indent=2)


@tool
def github_get_repo(owner: str, repo: str) -> str:
    """Get details about a specific GitHub repository."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    data = _github_request(f"/repos/{owner}/{repo}", token)
    return json.dumps(
        {
            "name": data.get("full_name"),
            "description": data.get("description") or "",
            "stars": data.get("stargazers_count"),
            "forks": data.get("forks_count"),
            "language": data.get("language"),
            "open_issues": data.get("open_issues_count"),
            "default_branch": data.get("default_branch", "main"),
            "url": data.get("html_url"),
        },
        indent=2,
    )


@tool
def github_get_file_contents(
    owner: str, repo: str, path: str, ref: str = "main"
) -> str:
    """Fetch and decode the contents of a file from a GitHub repository."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    encoded_path = urllib.parse.quote(path.lstrip("/"))
    data = _github_request(
        f"/repos/{owner}/{repo}/contents/{encoded_path}?ref={ref}", token
    )

    if isinstance(data, list):
        return json.dumps(
            {
                "type": "directory",
                "entries": [
                    {"name": item.get("name"), "type": item.get("type")}
                    for item in data
                ],
            },
            indent=2,
        )

    content_base64 = data.get("content", "")
    if content_base64 and data.get("encoding") == "base64":
        try:
            decoded_text = base64.b64decode(content_base64).decode(
                "utf-8", errors="replace"
            )
            return json.dumps(
                {
                    "path": data.get("path"),
                    "size": data.get("size"),
                    "sha": data.get("sha"),
                    "content": decoded_text,
                },
                indent=2,
            )
        except Exception as err:
            return json.dumps(
                {"error": f"Failed to decode base64 file content: {err}"}
            )

    return json.dumps(
        {
            "path": data.get("path"),
            "size": data.get("size"),
            "download_url": data.get("download_url"),
        },
        indent=2,
    )


@tool
def github_list_pull_requests(
    owner: str, repo: str, state: str = "open", max_results: int = 10
) -> str:
    """List pull requests for a repository. State can be 'open', 'closed', or 'all'."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    pulls = _github_request(
        f"/repos/{owner}/{repo}/pulls?state={state}&per_page={min(max_results, 30)}",
        token,
    )
    results = []
    for pr in pulls:
        results.append(
            {
                "number": pr.get("number"),
                "title": pr.get("title"),
                "state": pr.get("state"),
                "author": pr.get("user", {}).get("login"),
                "head_branch": pr.get("head", {}).get("ref"),
                "base_branch": pr.get("base", {}).get("ref"),
                "draft": pr.get("draft", False),
                "created_at": pr.get("created_at"),
                "url": pr.get("html_url"),
            }
        )
    return json.dumps(results, indent=2)


@tool
def github_get_pull_request(owner: str, repo: str, pull_number: int) -> str:
    """Get detailed information about a specific pull request including additions, deletions, and changed files count."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    pr = _github_request(f"/repos/{owner}/{repo}/pulls/{pull_number}", token)
    return json.dumps(
        {
            "number": pr.get("number"),
            "title": pr.get("title"),
            "state": pr.get("state"),
            "author": pr.get("user", {}).get("login"),
            "body": pr.get("body") or "",
            "head_branch": pr.get("head", {}).get("ref"),
            "base_branch": pr.get("base", {}).get("ref"),
            "mergeable": pr.get("mergeable"),
            "additions": pr.get("additions"),
            "deletions": pr.get("deletions"),
            "changed_files": pr.get("changed_files"),
            "created_at": pr.get("created_at"),
            "url": pr.get("html_url"),
        },
        indent=2,
    )


@tool
def github_list_issues(
    owner: str, repo: str, state: str = "open", max_results: int = 10
) -> str:
    """List issues for a repository (excluding PRs). State can be 'open', 'closed', or 'all'."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    issues = _github_request(
        f"/repos/{owner}/{repo}/issues?state={state}&per_page={min(max_results, 30)}",
        token,
    )
    results = []
    for i in issues:
        if i.get("pull_request"):
            continue
        results.append(
            {
                "number": i.get("number"),
                "title": i.get("title"),
                "state": i.get("state"),
                "author": i.get("user", {}).get("login"),
                "comments": i.get("comments", 0),
                "created_at": i.get("created_at"),
                "url": i.get("html_url"),
            }
        )
    return json.dumps(results, indent=2)


@tool
def github_create_issue(
    owner: str,
    repo: str,
    title: str,
    body: str,
    labels: list[str] | None = None,
) -> str:
    """Create a new issue in a GitHub repository."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    payload: dict[str, Any] = {"title": title, "body": body}
    if labels:
        payload["labels"] = labels

    created = _github_request(
        f"/repos/{owner}/{repo}/issues", token, method="POST", body=payload
    )
    return json.dumps(
        {
            "number": created.get("number"),
            "title": created.get("title"),
            "url": created.get("html_url"),
            "status": "created",
        },
        indent=2,
    )


@tool
def github_create_issue_comment(
    owner: str, repo: str, issue_number: int, body: str
) -> str:
    """Post a comment onto a GitHub issue or pull request."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    comment = _github_request(
        f"/repos/{owner}/{repo}/issues/{issue_number}/comments",
        token,
        method="POST",
        body={"body": body},
    )
    return json.dumps(
        {
            "id": comment.get("id"),
            "url": comment.get("html_url"),
            "status": "comment_created",
        },
        indent=2,
    )


@tool
def github_search_code(query: str, max_results: int = 10) -> str:
    """Search for code across GitHub repositories."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get GitHub token. Please try again later."

    encoded_query = urllib.parse.quote(query)
    data = _github_request(
        f"/search/code?q={encoded_query}&per_page={min(max_results, 30)}", token
    )
    results = []
    for item in data.get("items", []):
        results.append(
            {
                "name": item.get("name"),
                "path": item.get("path"),
                "repo": item.get("repository", {}).get("full_name"),
                "url": item.get("html_url"),
            }
        )
    return json.dumps(
        {"total_count": data.get("total_count", 0), "results": results},
        indent=2,
    )


github_tools = [
    github_list_repos,
    github_get_repo,
    github_get_file_contents,
    github_list_pull_requests,
    github_get_pull_request,
    github_list_issues,
    github_create_issue,
    github_create_issue_comment,
    github_search_code,
]
