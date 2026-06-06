import asyncio
import json
import sys

from .config import get_settings
from .google_actions import (
    GoogleActionError,
    _call_screenops_mcp_async,
    _exception_group_message,
)


async def _main() -> int:
    try:
        request = json.loads(sys.stdin.read())
        tool_name = request["tool_name"]
        arguments = request["arguments"]
        result = await _call_screenops_mcp_async(get_settings(), tool_name, arguments)
        print(f"SCREENOPS_MCP_RESULT={json.dumps(result)}")
        return 0
    except GoogleActionError as exc:
        print(f"SCREENOPS_MCP_ERROR={str(exc) or repr(exc)}")
        return 1
    except BaseExceptionGroup as exc:
        print(f"SCREENOPS_MCP_ERROR={_exception_group_message(exc)}")
        return 1
    except Exception as exc:
        print(f"SCREENOPS_MCP_ERROR={str(exc) or repr(exc)}")
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
