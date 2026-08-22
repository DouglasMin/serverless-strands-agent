from tool_registry import ToolFactorySet, build_tools, enabled


def fake_tool(name):
    def _tool():
        return name

    _tool.__name__ = name
    return _tool


def test_enabled_helper():
    assert enabled({"FOO": "1"}, "FOO", False) is True
    assert enabled({"FOO": "true"}, "FOO", False) is True
    assert enabled({"FOO": "TRUE"}, "FOO", False) is True
    assert enabled({"FOO": "yes"}, "FOO", False) is True
    assert enabled({"FOO": "on"}, "FOO", False) is True
    assert enabled({"FOO": "0"}, "FOO", True) is False
    assert enabled({"FOO": "false"}, "FOO", True) is False
    assert enabled({"FOO": "off"}, "FOO", True) is False
    assert enabled({}, "FOO", True) is True
    assert enabled({}, "FOO", False) is False


def test_build_tools_adds_base_and_oauth_tools():
    factories = ToolFactorySet(
        base_tools=lambda: [fake_tool("add_numbers")],
        mcp_tools=lambda: [],
        oauth_tools=lambda: [fake_tool("github_list_repos")],
        code_interpreter_tool=lambda: None,
        browser_tools=lambda: [],
    )
    tools = build_tools(factories=factories, env={"ENABLE_OAUTH_TOOLS": "1"})
    assert [t.__name__ for t in tools] == ["add_numbers", "github_list_repos"]


def test_build_tools_can_disable_mcp_and_enable_code_interpreter():
    ci = fake_tool("code_interpreter")
    factories = ToolFactorySet(
        base_tools=lambda: [fake_tool("add_numbers")],
        mcp_tools=lambda: [fake_tool("gateway")],
        oauth_tools=lambda: [],
        code_interpreter_tool=lambda: ci,
        browser_tools=lambda: [],
    )
    tools = build_tools(
        factories=factories,
        env={"ENABLE_MCP_GATEWAY": "0", "ENABLE_CODE_INTERPRETER": "1"},
    )
    assert [t.__name__ for t in tools] == ["add_numbers", "code_interpreter"]


def test_build_tools_browser_tools_flag():
    browser = fake_tool("browser_tool")
    factories = ToolFactorySet(
        base_tools=lambda: [fake_tool("add_numbers")],
        mcp_tools=lambda: [],
        oauth_tools=lambda: [],
        code_interpreter_tool=lambda: None,
        browser_tools=lambda: [browser],
    )
    # Default is disabled (False)
    tools_disabled = build_tools(factories=factories, env={})
    assert [t.__name__ for t in tools_disabled] == ["add_numbers"]

    # Explicitly enabled
    tools_enabled = build_tools(factories=factories, env={"ENABLE_BROWSER_TOOLS": "true"})
    assert [t.__name__ for t in tools_enabled] == ["add_numbers", "browser_tool"]
