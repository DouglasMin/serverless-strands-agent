import base64
import json
from unittest.mock import patch

from oauth_tools import github


def test_github_list_repos():
    with (
        patch("oauth_tools.github._get_token_or_auth_url", return_value=("fake_token", None)),
        patch("oauth_tools.github._github_request", return_value=[
            {"full_name": "owner/repo1", "description": "test repo", "html_url": "https://github.com/owner/repo1", "language": "Python"}
        ]),
    ):
        res = github.github_list_repos()
        data = json.loads(res)
        assert len(data) == 1
        assert data[0]["name"] == "owner/repo1"
        assert data[0]["language"] == "Python"


def test_github_get_file_contents():
    raw_text = "def hello():\n    return 'world'"
    encoded = base64.b64encode(raw_text.encode("utf-8")).decode("utf-8")
    with (
        patch("oauth_tools.github._get_token_or_auth_url", return_value=("fake_token", None)),
        patch("oauth_tools.github._github_request", return_value={
            "path": "src/hello.py",
            "size": len(raw_text),
            "sha": "123456",
            "encoding": "base64",
            "content": encoded,
        }),
    ):
        res = github.github_get_file_contents("owner", "repo", "src/hello.py")
        data = json.loads(res)
        assert data["path"] == "src/hello.py"
        assert data["content"] == raw_text


def test_github_list_pull_requests():
    with (
        patch("oauth_tools.github._get_token_or_auth_url", return_value=("fake_token", None)),
        patch("oauth_tools.github._github_request", return_value=[
            {
                "number": 42,
                "title": "Add feature X",
                "state": "open",
                "user": {"login": "alice"},
                "head": {"ref": "feature-x"},
                "base": {"ref": "main"},
                "draft": False,
                "created_at": "2026-08-22T00:00:00Z",
                "html_url": "https://github.com/owner/repo/pull/42",
            }
        ]),
    ):
        res = github.github_list_pull_requests("owner", "repo")
        data = json.loads(res)
        assert len(data) == 1
        assert data[0]["number"] == 42
        assert data[0]["author"] == "alice"


def test_github_create_issue():
    with (
        patch("oauth_tools.github._get_token_or_auth_url", return_value=("fake_token", None)),
        patch("oauth_tools.github._github_request", return_value={
            "number": 101,
            "title": "Bug in auth",
            "html_url": "https://github.com/owner/repo/issues/101",
        }),
    ):
        res = github.github_create_issue("owner", "repo", "Bug in auth", "Steps to reproduce...")
        data = json.loads(res)
        assert data["number"] == 101
        assert data["status"] == "created"


def test_github_search_code():
    with (
        patch("oauth_tools.github._get_token_or_auth_url", return_value=("fake_token", None)),
        patch("oauth_tools.github._github_request", return_value={
            "total_count": 1,
            "items": [
                {
                    "name": "auth.py",
                    "path": "server/auth.py",
                    "repository": {"full_name": "owner/repo"},
                    "html_url": "https://github.com/owner/repo/blob/main/server/auth.py",
                }
            ],
        }),
    ):
        res = github.github_search_code("def authenticate")
        data = json.loads(res)
        assert data["total_count"] == 1
        assert data["results"][0]["name"] == "auth.py"
