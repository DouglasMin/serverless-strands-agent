from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping


def enabled(env: Mapping[str, str], name: str, default: bool) -> bool:
    """Parse boolean flag from environment mapping."""
    value = env.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class ToolFactorySet:
    base_tools: Callable[[], list[Any]] = lambda: []
    mcp_tools: Callable[[], list[Any]] = lambda: []
    oauth_tools: Callable[[], list[Any]] = lambda: []
    office_tools: Callable[[], list[Any]] = lambda: []
    code_interpreter_tool: Callable[[], Any | None] = lambda: None
    browser_tools: Callable[[], list[Any]] = lambda: []


def build_tools(
    factories: ToolFactorySet,
    env: Mapping[str, str] | None = None,
) -> list[Any]:
    """Assemble tool list deterministically based on feature flags."""
    values = os.environ if env is None else env
    tools: list[Any] = []
    tools.extend(factories.base_tools())

    if enabled(values, "ENABLE_MCP_GATEWAY", True):
        tools.extend([tool for tool in factories.mcp_tools() if tool])

    if enabled(values, "ENABLE_OAUTH_TOOLS", True):
        tools.extend(factories.oauth_tools())

    if enabled(values, "ENABLE_OFFICE_TOOLS", True):
        tools.extend(factories.office_tools())

    if enabled(values, "ENABLE_CODE_INTERPRETER", True):
        code_tool = factories.code_interpreter_tool()
        if code_tool:
            tools.append(code_tool)

    if enabled(values, "ENABLE_BROWSER_TOOLS", False):
        tools.extend(factories.browser_tools())

    return tools
