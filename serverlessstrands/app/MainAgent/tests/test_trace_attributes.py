from unittest.mock import Mock

from strands import Agent

import main


def test_uses_the_exact_keys_langfuse_maps():
    """Langfuse only recognises these specific keys; a typo yields an anonymous trace."""
    attrs = main.trace_attributes("sess-1", "user-1", enable_memory=True)

    assert attrs["session.id"] == "sess-1"
    assert attrs["user.id"] == "user-1"
    assert "langfuse.trace.tags" in attrs


def test_values_survive_strands_type_filter():
    """Agent.__init__ silently drops attrs that aren't str/int/float/bool or a list
    of those. A dropped attribute looks identical to one that was never set."""
    attrs = main.trace_attributes("sess-1", "user-1", enable_memory=True)

    agent = Agent(model=Mock(), tools=[], trace_attributes=attrs)

    assert agent.trace_attributes == attrs, "Strands dropped one or more attributes"


def test_memory_tag_reflects_whether_memory_was_active(monkeypatch):
    monkeypatch.setattr(main, "ENVIRONMENT", "prod")

    on = main.trace_attributes("s", "u", enable_memory=True)["langfuse.trace.tags"]
    off = main.trace_attributes("s", "u", enable_memory=False)["langfuse.trace.tags"]

    assert "memory:on" in on
    assert "memory:off" in off
    assert "env:prod" in on


def test_environment_tag_defaults_to_dev_when_unset():
    tags = main.trace_attributes("s", "u", enable_memory=True)["langfuse.trace.tags"]
    assert any(t.startswith("env:") for t in tags)
