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

"""Execute client-side tools in a conversation without constructing tool-result messages.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python python/examples/conversation_client_tool.py

For regional, PrivateLink, custom, or proxy endpoints, set
SNOWFLAKE_BASE_URL instead of SNOWFLAKE_ACCOUNT.
"""

from __future__ import annotations

import os
from typing import Any

from snowflake.cortex.agents import ClientToolUse, CortexAgentClient


def execute_client_tool(tool_use: ClientToolUse) -> dict[str, Any]:
    """Application-owned tool dispatch; replace this fixture with a real service call."""
    if tool_use.name != "get_weather":
        raise ValueError(f"Unexpected client tool: {tool_use.name}")
    location = tool_use.input.get("location")
    if location != "San Francisco":
        raise ValueError(f"Unexpected location: {location!r}")
    # Deterministic example data keeps the recorded example stable.
    return {"location": location, "temperature_c": 18, "condition": "clear"}


client = CortexAgentClient(
    base_url=os.getenv("SNOWFLAKE_BASE_URL"),
    account=None if os.getenv("SNOWFLAKE_BASE_URL") else os.environ["SNOWFLAKE_ACCOUNT"],
    auth=os.environ["SNOWFLAKE_PAT"],
)

conversation = None
try:
    # A generic tool without a tool_resources entry is executed by the client.
    conversation = client.conversations.create(
        origin_application="cortex_agent_sdk",
        agent={
            "type": "inline",
            "spec": {
                "models": {"orchestration": "claude-sonnet-4-5"},
                "tools": [
                    {
                        "tool_spec": {
                            "type": "generic",
                            "name": "get_weather",
                            "description": "Get the current weather for a city.",
                            "input_schema": {
                                "type": "object",
                                "properties": {"location": {"type": "string"}},
                                "required": ["location"],
                            },
                        }
                    }
                ],
            },
        },
    )
    pending_turn = conversation.send(
        "Use get_weather for San Francisco, then give the current weather in one sentence."
    )
    tool_uses = pending_turn.client_tool_uses()

    if tool_uses:
        for tool_use in tool_uses:
            print(f"client tool: {tool_use.name} input={tool_use.input}")
        continued_turn = conversation.send_tool_results(
            [(tool_use, execute_client_tool(tool_use)) for tool_use in tool_uses]
        )
        response = continued_turn.result()
    else:
        response = pending_turn.result()
    print(f"assistant: {response.text.strip()}")
finally:
    if conversation is not None:
        conversation.delete()
    client.close()
