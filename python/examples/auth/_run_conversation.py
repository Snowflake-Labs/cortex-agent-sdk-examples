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

"""Shared minimal Agent API verification used by the authentication examples."""

from snowflake.cortex.agents import AgentResponse, Conversation, CortexAgentClient, Turn


def run_conversation(client: CortexAgentClient) -> None:
    conversation: Conversation = client.conversations.create(
        origin_application="cortex_agent_sdk",
        agent={"type": "inline", "spec": {"models": {"orchestration": "auto"}}},
    )
    try:
        turn: Turn = conversation.send("Reply with exactly: authentication succeeded")
        response: AgentResponse = turn.result()
        print(f"conversation={conversation.id}")
        print(f"run={turn.id}")
        print(f"response={response.text!r}")
    finally:
        conversation.delete()
