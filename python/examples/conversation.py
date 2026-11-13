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

"""One thread alternating inline, data, and coding-agent turns."""

from __future__ import annotations

import os

from snowflake.cortex.agents import AgentResponse, Conversation, CortexAgentClient, Turn

client: CortexAgentClient = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

conversation: Conversation = client.conversations.create(
    origin_application="sdk-examples",
    agent={"type": "inline", "spec": {"models": {"orchestration": "auto"}}},
)

inline_turn: Turn = conversation.send("What is Snowflake Arctic?")
inline_answer: AgentResponse = inline_turn.result()
print(inline_answer.text)

data_turn: Turn = conversation.send(
    "What is the highest closing price?",
    agent={
        "type": "data",
        "spec": {
            "database": os.environ["SNOWFLAKE_DATABASE"],
            "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
            "name": os.environ["SNOWFLAKE_DATA_AGENT"],
        },
    },
)
data_answer: AgentResponse = data_turn.result()
print(data_answer.text)

coding_turn: Turn = conversation.send(
    "Create a concise markdown summary.",
    agent={
        "type": "coding",
        "spec": {
            "models": {"orchestration": "claude-sonnet-4-5"},
            "permission_policy": "always_allow",
            "workspace_mounts": [{"name": "USER$MY_USER.PUBLIC.DEFAULT$"}],
        },
    },
)
coding_answer: AgentResponse = coding_turn.result()
print(coding_answer.text)

conversation.rename("SDK conversation example")
conversation.delete()
client.close()
