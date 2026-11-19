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

"""Follow-up turns and attach() on a live account.

Creates one conversation, sends a second turn on it, then attaches with the same
agent and sends again without passing ``agent`` on that send. Sync and async.

Usage:
    SNOWFLAKE_HOST=... SNOWFLAKE_PAT=... python python/examples/conversation_followups.py
"""

from __future__ import annotations

import asyncio
import os

from snowflake.cortex.agents import (
    AgentResponse,
    AsyncCortexAgentClient,
    AsyncTurn,
    Conversation,
    CortexAgentClient,
    Turn,
)

AGENT = {"type": "inline", "spec": {"models": {"orchestration": "auto"}}}


def client_kwargs() -> dict[str, object]:
    host = os.getenv("SNOWFLAKE_HOST")
    return {
        "base_url": f"https://{host}" if host else None,
        "account": os.getenv("SNOWFLAKE_ACCOUNT"),
        "auth": os.environ["SNOWFLAKE_PAT"],
    }


def snippet(answer: AgentResponse) -> str:
    text = " ".join(answer.text.split())
    return text[:160]


def run_sync() -> None:
    client = CortexAgentClient(**client_kwargs())
    conversation: Conversation = client.conversations.create(
        origin_application="sdk-examples",
        agent=AGENT,
    )
    print(f"  thread {conversation.id}")
    try:
        print("=== 1. First turn ===")
        first: Turn = conversation.send("In one sentence, what is Snowflake?")
        first_answer: AgentResponse = first.result()
        print(f"  run {first.id}")
        print(f"  message {first_answer.message_id}")
        print(f"  {snippet(first_answer)}")

        print("=== 2. Follow-up uses the previous assistant message ===")
        follow_up: Turn = conversation.send("Which product did you name first?")
        follow_up_answer: AgentResponse = follow_up.result()
        print(f"  message {follow_up_answer.message_id}")
        print(f"  {snippet(follow_up_answer)}")

        print("=== 3. attach keeps the agent ===")
        attached: Conversation = client.conversations.attach(conversation.id, agent=AGENT)
        continued: Turn = attached.send("Repeat that product name in five words or fewer.")
        continued_answer: AgentResponse = continued.result()
        print(f"  message {continued_answer.message_id}")
        print(f"  {snippet(continued_answer)}")
    finally:
        conversation.delete()
        client.close()
        print(f"  deleted thread {conversation.id}")


async def run_async() -> None:
    client = AsyncCortexAgentClient(**client_kwargs())
    conversation = await client.conversations.create(
        origin_application="sdk-examples",
        agent=AGENT,
    )
    print(f"  thread {conversation.id}")
    try:
        first: AsyncTurn = await conversation.send("In one sentence, what is a warehouse?")
        first_answer: AgentResponse = await first.result()
        print(f"  message {first_answer.message_id}")
        print(f"  {snippet(first_answer)}")

        attached = await client.conversations.attach(conversation.id, agent=AGENT)
        continued: AsyncTurn = await attached.send("Name one thing a warehouse does.")
        continued_answer: AgentResponse = await continued.result()
        print(f"  message {continued_answer.message_id}")
        print(f"  {snippet(continued_answer)}")
    finally:
        await conversation.delete()
        await client.close()
        print(f"  deleted thread {conversation.id}")


def main() -> None:
    run_sync()
    print("=== 4. Async client ===")
    asyncio.run(run_async())


if __name__ == "__main__":
    main()
