# Copyright 2026 Snowflake Inc.
# SPDX-License-Identifier: Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Exercise one-shot and interactive Cortex Code SDK features through the CLI.

Usage:
    CORTEX_CONN=my_connection uv run python examples/cortexcode/query_cli.py
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from collections.abc import Sequence
from pathlib import Path

from cortex_agent_sdk.cortexcode import (
    AssistantMessage,
    CortexCodeAgentOptions,
    CortexCodeSDKClient,
    InitSystemMessage,
    ResultMessage,
    ToolUseBlock,
    query,
)


def print_summary(label: str, messages: Sequence[object]) -> ResultMessage:
    result = next(message for message in messages if isinstance(message, ResultMessage))
    tools = [
        block.name
        for message in messages
        if isinstance(message, AssistantMessage)
        for block in message.content
        if isinstance(block, ToolUseBlock)
    ]
    print(f"{label}.status={result.subtype}")
    print(f"{label}.message_types={sorted({type(message).__name__ for message in messages})}")
    print(f"{label}.tool_calls={tools}")
    print(f"{label}.turns={result.num_turns}")
    return result


async def main() -> None:
    connection = os.getenv("CORTEX_CONN")
    with tempfile.TemporaryDirectory(prefix="cortex-code-sdk-example-") as temp_dir:
        workdir = Path(temp_dir)
        marker = workdir / "sdk_marker.txt"
        options = CortexCodeAgentOptions(
            connection=connection,
            mode="cli",
            cwd=workdir,
            allowed_tools=["Bash", "Read", "Write", "Edit"],
            allow_dangerously_skip_permissions=True,
        )

        print("=== interactive tools and session continuity ===")
        async with CortexCodeSDKClient(options) as client:
            server_info = await client.get_server_info()
            print(f"control.server_info={server_info is not None}")
            await client.set_permission_mode("bypassPermissions")
            print("control.set_permission_mode=ok")

            await client.query(
                "Use a tool to create sdk_marker.txt containing exactly "
                "PUBLIC_PYTHON_SDK_MARKER, then use a separate tool call to read it. "
                "Finally say what you read."
            )
            first = [message async for message in client.receive_response()]
            first_result = print_summary("turn1", first)
            init = next(
                (message for message in first if isinstance(message, InitSystemMessage)),
                None,
            )
            print(f"turn1.init_seen={init is not None}")
            print(f"turn1.file_created={marker.exists()}")
            print(f"turn1.file_contents={marker.read_text().strip() if marker.exists() else ''}")

            await client.query(
                "Without reading the file again, recall the exact marker from the previous "
                "turn and reply with only that marker."
            )
            second = [message async for message in client.receive_response()]
            second_result = print_summary("turn2", second)
            print(f"session.same_id={second_result.session_id == first_result.session_id}")
            print(
                "session.context_recalled="
                f"{'PUBLIC_PYTHON_SDK_MARKER' in (second_result.result or '')}"
            )

        print("=== one-shot structured output ===")
        schema = {
            "type": "object",
            "properties": {
                "sum": {"type": "number"},
                "factors": {"type": "array", "items": {"type": "number"}},
            },
            "required": ["sum", "factors"],
        }
        structured_messages = [
            message
            async for message in query(
                prompt="Return the sum of 20 and 22 and its two input factors.",
                options=CortexCodeAgentOptions(
                    connection=connection,
                    mode="cli",
                    output_format={"type": "json_schema", "schema": schema},
                ),
            )
        ]
        structured = print_summary("structured", structured_messages)
        print(f"structured.value={structured.structured_output}")
        value = structured.structured_output
        print(
            "structured.schema_valid="
            f"{isinstance(value, dict) and value.get('sum') == 42 and value.get('factors') == [20, 22]}"
        )


if __name__ == "__main__":
    asyncio.run(main())
