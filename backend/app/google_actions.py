import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import TextContent

from .config import Settings
from .google_api_adapters import GoogleActionError, has_token
from .models import ProposedAction

TOOL_MAP = {
    "gmail.drafts.create": "gmail_draft_create",
    "calendar.events.create": "calendar_event_create",
    "sheets.values.append": "sheets_values_append",
}

VERIFY_TOOL_MAP = {
    "gmail.drafts.create": "gmail_draft_verify",
    "calendar.events.create": "calendar_event_verify",
    "sheets.values.append": "sheets_append_verify",
}


def execute_action(settings: Settings, action: ProposedAction) -> dict[str, Any]:
    tool_name = TOOL_MAP.get(action.tool)
    if not tool_name:
        raise GoogleActionError(f"Unsupported action tool: {action.tool}")
    result = _call_screenops_mcp(settings, tool_name, dict(action.payload))
    result["mcp_tool"] = tool_name
    result["transport"] = "mcp_stdio"
    return result


def verify_action(settings: Settings, action: ProposedAction) -> dict[str, Any]:
    if not action.result:
        raise GoogleActionError("Cannot verify action without execution result.")
    tool_name = VERIFY_TOOL_MAP.get(action.tool)
    if not tool_name:
        raise GoogleActionError(f"Unsupported verification tool: {action.tool}")
    result = _call_screenops_mcp(settings, tool_name, {"result": dict(action.result)})
    result["mcp_tool"] = tool_name
    result["transport"] = "mcp_stdio"
    return result


def _call_screenops_mcp(settings: Settings, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(settings.root_dir / "backend")
    completed = subprocess.run(
        [_python_executable(), "-m", "app.mcp_tool_runner"],
        input=json.dumps({"tool_name": tool_name, "arguments": arguments}),
        text=True,
        capture_output=True,
        cwd=str(settings.root_dir),
        env=env,
        timeout=90,
        check=False,
    )
    result_line = _find_prefixed_line(completed.stdout, "SCREENOPS_MCP_RESULT=")
    if completed.returncode == 0 and result_line:
        try:
            return json.loads(result_line)
        except json.JSONDecodeError as exc:
            raise GoogleActionError(f"MCP helper returned invalid JSON: {result_line}") from exc

    error_line = _find_prefixed_line(completed.stdout, "SCREENOPS_MCP_ERROR=")
    details = error_line or completed.stderr.strip() or completed.stdout.strip() or f"exit code {completed.returncode}"
    raise GoogleActionError(f"MCP tool call failed for {tool_name}: {details}")


def _call_screenops_mcp_in_process(settings: Settings, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    try:
        return asyncio.run(_call_screenops_mcp_async(settings, tool_name, arguments))
    except GoogleActionError:
        raise
    except BaseExceptionGroup as exc:
        raise GoogleActionError(f"MCP tool call failed for {tool_name}: {_exception_group_message(exc)}") from exc
    except Exception as exc:
        message = str(exc) or repr(exc)
        raise GoogleActionError(f"MCP tool call failed for {tool_name}: {message}") from exc


async def _call_screenops_mcp_async(settings: Settings, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(settings.root_dir / "backend")
    params = StdioServerParameters(
        command=_python_executable(),
        args=["-m", "app.screenops_google_mcp"],
        env=env,
    )
    async with stdio_client(params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            response = await session.call_tool(tool_name, arguments)
            if response.isError:
                message = _content_to_text(response.content).strip() or repr(response)
                raise GoogleActionError(message)
            return _content_to_json(response.content)


def _content_to_text(content: list[Any]) -> str:
    parts: list[str] = []
    for item in content:
        if isinstance(item, TextContent):
            parts.append(item.text)
        elif hasattr(item, "text"):
            parts.append(str(item.text))
        else:
            parts.append(str(item))
    return "\n".join(parts)


def _content_to_json(content: list[Any]) -> dict[str, Any]:
    text = _content_to_text(content).strip()
    if not text:
        return {}
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise GoogleActionError(f"MCP tool returned non-JSON content: {text}") from exc
    if not isinstance(value, dict):
        raise GoogleActionError(f"MCP tool returned unexpected JSON content: {value!r}")
    return value


def _exception_group_message(exc: BaseExceptionGroup) -> str:
    messages: list[str] = []

    def collect(group: BaseExceptionGroup) -> None:
        for item in group.exceptions:
            if isinstance(item, BaseExceptionGroup):
                collect(item)
            else:
                message = str(item) or repr(item)
                messages.append(message)

    collect(exc)
    return "; ".join(message for message in messages if message) or str(exc)


def _python_executable() -> str:
    executable = Path(sys.executable)
    if executable.name.lower().startswith("python") and executable.exists():
        return str(executable)

    for candidate_name in ("python.exe", "python"):
        candidate = executable.with_name(candidate_name)
        if candidate.exists():
            return str(candidate)

    return sys.executable


def _find_prefixed_line(text: str, prefix: str) -> str | None:
    for line in reversed(text.splitlines()):
        if line.startswith(prefix):
            return line[len(prefix) :]
    return None
