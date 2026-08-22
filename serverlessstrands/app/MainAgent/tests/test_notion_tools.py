import json
from unittest.mock import patch

from oauth_tools import notion


def test_text_to_notion_blocks():
    text = """# Heading 1
## Heading 2
### Heading 3
- Bullet item 1
* Bullet item 2
Regular paragraph text."""
    blocks = notion._text_to_notion_blocks(text)
    assert len(blocks) == 6
    assert blocks[0]["type"] == "heading_1"
    assert blocks[1]["type"] == "heading_2"
    assert blocks[2]["type"] == "heading_3"
    assert blocks[3]["type"] == "bulleted_list_item"
    assert blocks[4]["type"] == "bulleted_list_item"
    assert blocks[5]["type"] == "paragraph"


def test_notion_create_page():
    with (
        patch("oauth_tools.notion._get_token_or_auth_url", return_value=("fake_token", None)),
        patch("oauth_tools.notion._notion_request", return_value={
            "id": "page-123",
            "url": "https://notion.so/page-123",
        }),
    ):
        res = notion.notion_create_page("parent-456", "Architecture Notes", "# Title\nDetails...")
        data = json.loads(res)
        assert data["id"] == "page-123"
        assert data["title"] == "Architecture Notes"
        assert data["status"] == "created"


def test_notion_append_blocks():
    with (
        patch("oauth_tools.notion._get_token_or_auth_url", return_value=("fake_token", None)),
        patch("oauth_tools.notion._notion_request", return_value={
            "results": [{"id": "b-1"}, {"id": "b-2"}],
        }),
    ):
        res = notion.notion_append_blocks("page-123", "New note paragraph\n- Task 1")
        data = json.loads(res)
        assert data["status"] == "appended"
        assert data["blocks_count"] == 2


def test_notion_add_comment():
    with (
        patch("oauth_tools.notion._get_token_or_auth_url", return_value=("fake_token", None)),
        patch("oauth_tools.notion._notion_request", return_value={
            "id": "comment-789",
        }),
    ):
        res = notion.notion_add_comment("page-123", "Looks great, approved!")
        data = json.loads(res)
        assert data["id"] == "comment-789"
        assert data["status"] == "comment_added"
