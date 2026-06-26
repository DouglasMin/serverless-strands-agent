import urllib.request
import json
from typing import Any

from strands import tool
from oauth_tools import get_oauth_token

PROVIDER_NAME = "github-provider"
SCOPES = ["repo", "user"]
GITHUB_API = "https://api.github.com"


def _github_request(path: str, token: str) -> Any:
    req = urllib.request.Request(
        f"{GITHUB_API}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def _get_token_or_auth_url() -> tuple[str | None, str | None]:
    """Returns (token, auth_url). One will be None."""
    result = get_oauth_token(PROVIDER_NAME, SCOPES)
    if "token" in result:
        return result["token"], None
    if "auth_url" in result:
        return None, result["auth_url"]
    return None, None


@tool
def github_list_repos(max_results: int = 10) -> str:
    """List the authenticated user's GitHub repositories. Returns repo names, descriptions, and URLs."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        from oauth_tools import auth_url_queue
        auth_url_queue.put_nowait(auth_url)
        return "GitHub authorization required. A login popup has been sent to the user. Please wait for them to complete authorization and try again."
    if not token:
        return "Failed to get GitHub token. Please try again later."

    repos = _github_request(f"/user/repos?sort=updated&per_page={min(max_results, 30)}", token)
    results = []
    for r in repos:
        results.append({
            "name": r["full_name"],
            "description": r.get("description", ""),
            "url": r["html_url"],
            "language": r.get("language"),
            "updated_at": r.get("updated_at"),
        })
    return json.dumps(results, indent=2)


@tool
def github_get_repo(owner: str, repo: str) -> str:
    """Get details about a specific GitHub repository."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        from oauth_tools import auth_url_queue
        auth_url_queue.put_nowait(auth_url)
        return "GitHub authorization required. A login popup has been sent to the user. Please wait for them to complete authorization and try again."
    if not token:
        return "Failed to get GitHub token. Please try again later."

    data = _github_request(f"/repos/{owner}/{repo}", token)
    return json.dumps({
        "name": data["full_name"],
        "description": data.get("description", ""),
        "stars": data.get("stargazers_count"),
        "forks": data.get("forks_count"),
        "language": data.get("language"),
        "open_issues": data.get("open_issues_count"),
        "url": data["html_url"],
    }, indent=2)


@tool
def github_list_issues(owner: str, repo: str, state: str = "open", max_results: int = 10) -> str:
    """List issues for a GitHub repository. State can be 'open', 'closed', or 'all'."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        from oauth_tools import auth_url_queue
        auth_url_queue.put_nowait(auth_url)
        return "GitHub authorization required. A login popup has been sent to the user. Please wait for them to complete authorization and try again."
    if not token:
        return "Failed to get GitHub token. Please try again later."

    issues = _github_request(
        f"/repos/{owner}/{repo}/issues?state={state}&per_page={min(max_results, 30)}", token
    )
    results = []
    for i in issues:
        if i.get("pull_request"):
            continue
        results.append({
            "number": i["number"],
            "title": i["title"],
            "state": i["state"],
            "author": i["user"]["login"],
            "created_at": i["created_at"],
            "url": i["html_url"],
        })
    return json.dumps(results, indent=2)


github_tools = [github_list_repos, github_get_repo, github_list_issues]
