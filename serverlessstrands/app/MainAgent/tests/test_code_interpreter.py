from unittest.mock import MagicMock, patch
from tool_registry import ToolFactorySet, build_tools
from strands_tools.code_interpreter.models import (
    CodeInterpreterInput,
    ExecuteCodeAction,
    LanguageType,
)


def test_code_interpreter_factory_registered():
    mock_ci_tool = MagicMock()
    mock_ci_tool.__name__ = "code_interpreter"

    factories = ToolFactorySet(
        base_tools=lambda: [],
        mcp_tools=lambda: [],
        oauth_tools=lambda: [],
        code_interpreter_tool=lambda: mock_ci_tool,
        browser_tools=lambda: [],
    )

    tools = build_tools(factories=factories, env={"ENABLE_CODE_INTERPRETER": "true"})
    assert len(tools) == 1
    assert tools[0].__name__ == "code_interpreter"


def test_code_interpreter_disabled_via_flag():
    mock_ci_tool = MagicMock()
    mock_ci_tool.__name__ = "code_interpreter"

    factories = ToolFactorySet(
        base_tools=lambda: [],
        mcp_tools=lambda: [],
        oauth_tools=lambda: [],
        code_interpreter_tool=lambda: mock_ci_tool,
        browser_tools=lambda: [],
    )

    tools = build_tools(factories=factories, env={"ENABLE_CODE_INTERPRETER": "false"})
    assert len(tools) == 0


def test_code_interpreter_input_model_validation():
    action = ExecuteCodeAction(
        type="executeCode",
        code="print('hello')",
        language=LanguageType.PYTHON,
    )
    ci_input = CodeInterpreterInput(action=action)
    assert ci_input.action.type == "executeCode"
    assert ci_input.action.code == "print('hello')"
