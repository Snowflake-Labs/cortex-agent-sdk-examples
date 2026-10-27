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

"""Full CRUD lifecycle for a Cortex data agent, plus versioned runs.

Every newly created data agent gets a default ``VERSION$1``, so
``stream_version`` / ``run_version`` are exercised against that auto-created
version.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/data_agent_crud.py
"""

from __future__ import annotations

import os

from cortex_agent_sdk.api import (
    AgentResponseView,
    CortexAgentClient,
    StreamEvent,
)

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

schema_target = {
    "database": os.environ["SNOWFLAKE_DATABASE"],
    "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
}
agent_name = f"SDK_EXAMPLE_AGENT_{os.getpid()}"
agent_target = {**schema_target, "name": agent_name}
version_target = {**agent_target, "version": "VERSION$1"}
semantic_view = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

agent_spec = {
    "name": agent_name,
    "models": {"orchestration": "auto"},
    "instructions": {
        "orchestration": "Use the analyst tool for stock questions.",
        "response": "Be concise.",
    },
    "tools": [
        {
            "tool_spec": {
                "type": "cortex_analyst_text_to_sql",
                "name": "analyst",
                "description": "Query stocks",
            }
        }
    ],
    "tool_resources": {
        "analyst": {
            "semantic_view": semantic_view,
            "execution_environment": {"type": "warehouse", "warehouse": warehouse},
        }
    },
}

# 1. Create
print("=== Create agent ===")
create_result = client.agent.create(agent_spec, target=schema_target, create_mode="orReplace")
print(
    f"created {schema_target['database']}.{schema_target['schema']}.{agent_name} "
    f"(status: {(create_result or {}).get('status')})"
)

# 2. List
print("\n=== List agents ===")
agents = client.agent.list(target=schema_target)
for agent in agents[:5]:
    print(f"  {agent.get('name')} (owner={agent.get('owner')})")
if len(agents) > 5:
    print(f"  ... ({len(agents) - 5} more)")

# 3. Describe
print("\n=== Describe agent ===")
info = client.agent.describe(target=agent_target)
print(f"  name: {info.get('name')}")
print(f"  owner: {info.get('owner')}")
print(f"  database.schema: {info.get('database_name')}.{info.get('schema_name')}")

# 4. Update
print("\n=== Update agent ===")
update_result = client.agent.update({"comment": "Updated by SDK example"}, target=agent_target)
print(f"updated comment (status: {(update_result or {}).get('status')})")

# 5. Run (streaming, default version)
print("\n=== Run data agent (stream_data) ===")
stream = client.agent.stream_data(
    {
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": "What's the highest closing price?"}],
            }
        ]
    },
    target=agent_target,
)
stream.on(StreamEvent.TEXT, lambda delta, _acc: print(delta, end="", flush=True))
stream.done()
print()

# 6. Run against a specific version (streaming)
print(f"\n=== Run pinned version {version_target['version']} (stream_version) ===")
version_stream = client.agent.stream_version(
    {
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": "What's the lowest closing price?"}],
            }
        ]
    },
    target=version_target,
)
version_stream.on(StreamEvent.TEXT, lambda delta, _acc: print(delta, end="", flush=True))
version_stream.done()
print()

# 7. Non-streaming versioned run — returns an AgentResponseView
print("\n=== Non-streaming pinned version (run_version, stream=False) ===")
non_stream = client.agent.run_version(
    {
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "Give me one line about TSLA."}]}
        ],
        "stream": False,
    },
    target=version_target,
)
assert isinstance(non_stream, AgentResponseView)
print(f'  text: "{non_stream.text.strip()}"')
print(f"  content items: {len(non_stream.content)}, tool_uses={len(non_stream.tool_uses)}")

# 7b. Raw iterator via run_data (stream=True) — a plain for loop over events.
#     Same endpoint as stream_data; use this when you do not need .on() /
#     final_text() / abort().
print("\n=== run_data with stream=True (raw iterator) ===")
run_data_kinds: set[str] = set()
run_data_count = 0
for event in client.agent.run_data(
    {
        "messages": [{"role": "user", "content": [{"type": "text", "text": "one line about GS"}]}],
        "stream": True,
    },
    target=agent_target,
):
    run_data_count += 1
    run_data_kinds.add(event.get("event", ""))
print(f"  drained {run_data_count} events, kinds=[{', '.join(sorted(run_data_kinds))}]")

# 7c. Raw iterator via run_version (stream=True)
print("\n=== run_version with stream=True (raw iterator) ===")
run_version_kinds: set[str] = set()
run_version_count = 0
for event in client.agent.run_version(
    {
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "one line about MSFT"}]}
        ],
        "stream": True,
    },
    target=version_target,
):
    run_version_count += 1
    run_version_kinds.add(event.get("event", ""))
print(f"  drained {run_version_count} events, kinds=[{', '.join(sorted(run_version_kinds))}]")

# 7d. Background versioned run — returns an BackgroundRun. A background run against a
#     versioned data agent needs a thread: the server writes the assistant's
#     reply into it while the kickoff returns immediately with a run_id.
print("\n=== Background pinned-version run (run_version, background=True -> BackgroundRun) ===")
bg_thread = client.threads.create(origin_application="sdk-bg-ver")
try:
    bg_run = client.agent.run_version(
        {
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "one line about AAPL closing prices"}],
                }
            ],
            "thread_id": bg_thread["thread_id"],
            "parent_message_id": 0,
            "stream": False,
            "background": True,
        },
        target=version_target,
    )
    print(f"  kickoff: status={bg_run.initial_status} run_id={bg_run.run_id}")

    # .wait() drains to completion and materializes an AgentResponseView.
    bg_view = bg_run.wait()
    print(f"  view.role:            {bg_view.role}")
    print(f"  view.text (first 200): {bg_view.text[:200]}")
    print(f"  view.content items:   {len(bg_view.content)}")
    print(f"  view.tool_uses:       {len(bg_view.tool_uses)}")
    print(f"  view.tool_results:    {len(bg_view.tool_results)}")
    print(f"  view.metadata run_id: {bg_view.run_id or '-'}")
    print(
        f"  view.events:          "
        f"{len(bg_view.events) if bg_view.events is not None else '(from thread, no events)'}"
    )
finally:
    client.threads.delete(bg_thread["thread_id"])
    print(f"  deleted bg thread {bg_thread['thread_id']}")

# 8. Delete
print("\n=== Delete agent ===")
delete_result = client.agent.delete(target=agent_target, if_exists=True)
print(
    f"deleted {schema_target['database']}.{schema_target['schema']}.{agent_name} "
    f"(status: {(delete_result or {}).get('status')})"
)
