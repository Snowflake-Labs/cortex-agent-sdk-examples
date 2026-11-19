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

"""Send client-supplied tool results and attachments through a conversation.

Requires SNOWFLAKE_ACCOUNT + SNOWFLAKE_PAT, or a Snowflake connection profile
(CORTEX_EXAMPLE_CONNECTION defaults to ``default``). Set
CORTEX_EXAMPLE_DOCUMENT_URL to a real @stage/path to also run the document section.
Set CORTEX_EXAMPLE_BASE_URL when the profile's connector host is not the Agent API host.
"""

from __future__ import annotations

import os

import snowflake.connector
from snowflake.cortex.agents import (
    Conversation,
    ConversationInput,
    CortexAgentClient,
    SnowflakeSessionTokenAuth,
    Turn,
)

account = os.getenv("SNOWFLAKE_ACCOUNT")
pat = os.getenv("SNOWFLAKE_PAT")
connection = None
if account and pat:
    client: CortexAgentClient = CortexAgentClient(account=account, auth=pat)
else:
    connection_name = os.getenv("CORTEX_EXAMPLE_CONNECTION", "default")
    connection = snowflake.connector.connect(connection_name=connection_name)
    # Snowflake account identifiers may contain underscores; account URL hostnames
    # use hyphens instead, which also lets Python's TLS hostname verifier match.
    api_host = connection.host.replace("_", "-")
    client = CortexAgentClient(
        base_url=os.getenv("CORTEX_EXAMPLE_BASE_URL", f"https://{api_host}"),
        auth=SnowflakeSessionTokenAuth(lambda: connection.rest.token),
    )
conversation: Conversation = client.conversations.create(
    origin_application="cortex_agent_sdk",
    agent={
        "type": "inline",
        "spec": {
            "models": {"orchestration": "auto"},
            "tools": [
                {
                    "tool_spec": {
                        "type": "generic",
                        "name": "weather",
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
document_url = os.getenv("CORTEX_EXAMPLE_DOCUMENT_URL")

try:
    pending_turn = conversation.send("Use the weather tool for San Francisco.")
    tool_uses = pending_turn.client_tool_uses()
    if not tool_uses or any(tool.name != "weather" for tool in tool_uses):
        raise RuntimeError("The agent did not request the weather tool")

    # Return content using the IDs from the pending client-side tool requests.
    tool_result: ConversationInput = [
        {
            "type": "tool_result",
            "tool_result": {
                "tool_use_id": tool.tool_use_id,
                "name": tool.name,
                "status": "success",
                "content": [
                    {"type": "json", "json": {"temperature_c": 21, "condition": "clear"}},
                    {"type": "text", "text": "Weather supplied by the client."},
                ],
            },
        }
        for tool in tool_uses
    ]
    tool_turn: Turn = conversation.send(tool_result)
    print(f"tool-result response: {tool_turn.result().text!r}")

    # Use the same content array for a document already available on a stage.
    if document_url:
        if not document_url.startswith("@"):
            raise ValueError("CORTEX_EXAMPLE_DOCUMENT_URL must be a Snowflake @stage/path")
        document: ConversationInput = [
            {
                "type": "document",
                "source": {
                    "file_name": document_url.rsplit("/", maxsplit=1)[-1],
                    "url": document_url,
                    "media_type": "text/plain",
                },
            },
            {"type": "text", "text": "Summarize this document."},
        ]
        document_turn: Turn = conversation.send(document)
        print(f"document response: {document_turn.result().text!r}")
    else:
        print("Skipped document input; set CORTEX_EXAMPLE_DOCUMENT_URL to run it.")
finally:
    conversation.delete()
    client.close()
    if connection is not None:
        connection.close()
