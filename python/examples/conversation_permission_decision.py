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

"""Continue a coding conversation after a tool-permission prompt.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python python/examples/conversation_permission_decision.py

For regional, PrivateLink, custom, or proxy endpoints, set
SNOWFLAKE_BASE_URL instead of SNOWFLAKE_ACCOUNT.
"""

from __future__ import annotations

import os

from snowflake.cortex.agents import CortexAgentClient, PermissionRequest

client = CortexAgentClient(
    base_url=os.getenv("SNOWFLAKE_BASE_URL"),
    account=None if os.getenv("SNOWFLAKE_BASE_URL") else os.environ["SNOWFLAKE_ACCOUNT"],
    auth=os.environ["SNOWFLAKE_PAT"],
)

prompt = (
    "Run this exact bash command and report the stdout: "
    "rm -rf /tmp/cortex-agent-sdk-conversation-permission-example-does-not-exist "
    "&& echo conversation-permission-example-ok"
)

conversation = None
try:
    conversation = client.conversations.create(
        origin_application="cortex_agent_sdk",
        agent={
            "type": "coding",
            "spec": {
                "permission_policy": "always_ask",
                "models": {"orchestration": "claude-sonnet-4-5"},
            },
        },
    )
    pending_turn = conversation.send(prompt)

    permission_requests = pending_turn.permission_requests()

    def selected_decision_for(permission: PermissionRequest) -> str:
        return "Allow this command" if "Allow this command" in permission.options else "Deny"

    if permission_requests:
        for permission in permission_requests:
            print("permission request")
            print(f"  tool: {permission.tool_name}")
            print(f"  options: {list(permission.options)}")
            print(f"  selected decision: {selected_decision_for(permission)}")

        # The helper waits for the paused turn, tracks its parent message, and
        # sends all structured permission decisions in one follow-up.
        continued_turn = conversation.send_permission_decisions(
            [(permission, selected_decision_for(permission)) for permission in permission_requests]
        )
        response = continued_turn.result()
    else:
        response = pending_turn.result()
    print(f"  continued text: {response.text.strip()}")
finally:
    if conversation is not None:
        conversation.delete()
    client.close()
