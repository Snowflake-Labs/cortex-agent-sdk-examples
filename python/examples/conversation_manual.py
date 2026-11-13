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

"""Multi-turn conversation using the **low-level** APIs — no ``Conversation``.

The flow:
  1. create a thread via ``client.threads.create``
  2. run each turn with explicit ``thread_id`` + ``parent_message_id``
  3. capture the assistant's ``message_id`` from the metadata event on the
     stream, and feed it back as the next turn's ``parent_message_id``
  4. list messages, then delete the thread

This is the plumbing that ``Conversation`` (see ``conversation.py``) hides.
Reach for this pattern when you need to build request bodies by hand, mix
threading with unusual body fields, or integrate with code that already tracks
these ids.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/conversation_manual.py
"""

from __future__ import annotations

import os

from snowflake.cortex.agents.api import AgentEvent, CortexAgentClient, StreamEvent

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

# --- 1. Create a thread ---
thread = client.threads.create(origin_application="sdk-examples")
thread_id = thread["thread_id"]
print(f"Created thread: {thread_id}")

# --- 2. First turn: parent_message_id = 0 for the very first message ---
stream1 = client.agent.stream(
    {
        "models": {"orchestration": "auto"},
        "thread_id": thread_id,
        "parent_message_id": 0,
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "What is Snowflake Arctic?"}]}
        ],
    }
)

# The assistant's message_id arrives on a `metadata` event — capture it so it can
# be passed as `parent_message_id` on the next turn.
assistant_message_id: int | None = None


def capture_message_id(event: AgentEvent) -> None:
    global assistant_message_id
    metadata = event.get("metadata") or {}
    if metadata.get("role") == "assistant" and isinstance(metadata.get("message_id"), int):
        assistant_message_id = metadata["message_id"]


stream1.on(StreamEvent.METADATA, capture_message_id)

first_reply = stream1.final_text()
print(f"\nTurn 1:\n{first_reply[:200]}{'...' if len(first_reply) > 200 else ''}")
print(f"\nCaptured assistant message ID: {assistant_message_id}")

# --- 3. Follow-up: pass the captured message id as parent_message_id ---
stream2 = client.agent.stream(
    {
        "models": {"orchestration": "auto"},
        "thread_id": thread_id,
        "parent_message_id": assistant_message_id,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "In one sentence, name one advantage over Llama 3."}
                ],
            }
        ],
    }
)
print(f"\nTurn 2:\n{stream2.final_text()}")

# --- 4. List the persisted messages ---
detail = client.threads.describe(thread_id, page_size=20)
print(f"\nThread now has {len(detail.get('messages') or [])} messages")

# --- 5. Clean up ---
client.threads.delete(thread_id)
print("Thread deleted")
