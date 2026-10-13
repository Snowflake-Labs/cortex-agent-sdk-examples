"""Exercise SDK MCP tools, tool hooks, and session forking through the CLI.

Usage:
    CORTEX_CONN=my_connection uv run python examples/cortexcode/mcp_hooks_fork.py
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Sequence
from dataclasses import replace
from typing import Any

from cortex_agent_sdk.cortexcode import (
    AssistantMessage,
    CortexCodeAgentOptions,
    CortexCodeSDKClient,
    HookContext,
    HookInput,
    HookJSONOutput,
    HookMatcher,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    create_sdk_mcp_server,
    fork_session,
    query,
    tool,
)

MCP_TOOL_NAME = "mcp__sdk-example-tools__lookup_fork_code"
FORK_CODE = "ORCHID-73"


def assistant_text(messages: Sequence[object]) -> str:
    return "".join(
        block.text
        for message in messages
        if isinstance(message, AssistantMessage)
        for block in message.content
        if isinstance(block, TextBlock)
    )


async def main() -> None:
    handler_calls: list[str] = []
    pre_hook_calls: list[str] = []
    post_hook_calls: list[str] = []

    @tool(
        "lookup_fork_code",
        "Return the stable code phrase used by the SDK fork example.",
        {},
    )
    async def lookup_fork_code(_arguments: dict[str, Any]) -> dict[str, Any]:
        handler_calls.append(MCP_TOOL_NAME)
        return {"content": [{"type": "text", "text": f"fork code: {FORK_CODE}"}]}

    async def before_tool(
        hook_input: HookInput,
        _tool_use_id: str | None,
        _context: HookContext,
    ) -> HookJSONOutput:
        pre_hook_calls.append(str(hook_input.get("tool_name", "unknown")))
        return {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
            }
        }

    async def after_tool(
        hook_input: HookInput,
        _tool_use_id: str | None,
        _context: HookContext,
    ) -> HookJSONOutput:
        post_hook_calls.append(str(hook_input.get("tool_name", "unknown")))
        return {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": "The SDK observed the MCP result.",
            }
        }

    sdk_server = create_sdk_mcp_server(
        "sdk-example-tools",
        tools=[lookup_fork_code],
    )
    base_options = CortexCodeAgentOptions(
        connection=os.getenv("CORTEX_CONN"),
        mode="cli",
        no_mcp=False,
        mcp_servers={"sdk-example-tools": sdk_server},
        allowed_tools=[MCP_TOOL_NAME],
        allow_dangerously_skip_permissions=True,
        hooks={
            "PreToolUse": [HookMatcher(matcher=MCP_TOOL_NAME, hooks=[before_tool])],
            "PostToolUse": [HookMatcher(matcher=MCP_TOOL_NAME, hooks=[after_tool])],
        },
    )

    print("=== in-process MCP tool and hooks ===")
    async with CortexCodeSDKClient(base_options) as client:
        mcp_status = await client.get_mcp_status()
        server = next(
            item for item in mcp_status["mcpServers"] if item["name"] == "sdk-example-tools"
        )
        print(f"mcp.status={server['status']}")
        print(f"mcp.tools={[item['name'] for item in server.get('tools', [])]}")

        await client.query(
            f"Call {MCP_TOOL_NAME} exactly once. Remember its returned code, then "
            "reply with exactly the returned text."
        )
        source_messages = [message async for message in client.receive_response()]

    source_result = next(
        message for message in source_messages if isinstance(message, ResultMessage)
    )
    tool_calls = [
        block.name
        for message in source_messages
        if isinstance(message, AssistantMessage)
        for block in message.content
        if isinstance(block, ToolUseBlock)
    ]
    print(f"mcp.run_status={source_result.subtype}")
    print(f"mcp.tool_calls={tool_calls}")
    print(f"mcp.handler_called_once={len(handler_calls) == 1}")
    print(f"hooks.pre_tool_calls={pre_hook_calls}")
    print(f"hooks.post_tool_calls={post_hook_calls}")
    print(f"hooks.pre_and_post_seen={len(pre_hook_calls) == len(post_hook_calls) == 1}")
    print(f"mcp.result_used={FORK_CODE in assistant_text(source_messages)}")

    print("=== fork and resume ===")
    forked_session_id = await fork_session(
        source_result.session_id,
        base_options=base_options,
    )
    print(f"fork.new_session={bool(forked_session_id)}")
    print(f"fork.id_differs={forked_session_id != source_result.session_id}")

    fork_messages = [
        message
        async for message in query(
            prompt=(
                "Without calling any tool, recall the exact code returned earlier in this "
                "conversation and reply with only that code."
            ),
            options=replace(
                base_options,
                resume=forked_session_id,
                allowed_tools=[],
                hooks=None,
                mcp_servers={},
            ),
        )
    ]
    fork_result = next(message for message in fork_messages if isinstance(message, ResultMessage))
    print(f"fork.run_status={fork_result.subtype}")
    print(f"fork.resumed_new_session={fork_result.session_id == forked_session_id}")
    print(f"fork.context_preserved={FORK_CODE in assistant_text(fork_messages)}")


if __name__ == "__main__":
    asyncio.run(main())
