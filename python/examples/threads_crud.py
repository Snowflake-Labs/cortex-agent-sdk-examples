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

"""Threads CRUD: create a thread, run the agent inside it, list messages, delete.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/threads_crud.py
"""

from __future__ import annotations

import json
import os

from snowflake.cortex.agents.api import (
    CortexAgentClient,
    EventType,
    ThreadMessageView,
)

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

# 1. Create a thread
thread = client.threads.create(origin_application="external")
thread_id = thread["thread_id"]
print("created thread", thread_id)

# 2. Run the agent with thread_id — include analyst + cortex_search tools so the
#    persisted assistant turn contains a rich content mix (text, thinking,
#    tool_use, tool_result, table, suggested_queries) for ThreadMessageView to
#    introspect below.
semantic_view = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
search_service = os.environ["SNOWFLAKE_SEARCH_SERVICE"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

events = client.agent.run(
    {
        "thread_id": thread_id,
        "parent_message_id": 0,
        "models": {"orchestration": "auto"},
        "instructions": {
            "orchestration": (
                "Use stocks_analyst for stock questions. Use wikipedia for general knowledge."
            ),
            "response": "Be concise.",
        },
        "tools": [
            {
                "tool_spec": {
                    "type": "cortex_analyst_text_to_sql",
                    "name": "stocks_analyst",
                    "description": "Query stock prices from STOCKS_DATA",
                }
            },
            {
                "tool_spec": {
                    "type": "cortex_search",
                    "name": "wikipedia",
                    "description": "Search Wikipedia articles",
                }
            },
        ],
        "tool_resources": {
            "stocks_analyst": {
                "semantic_view": semantic_view,
                "execution_environment": {"type": "warehouse", "warehouse": warehouse},
            },
            "wikipedia": {"search_service": search_service, "max_results": 3},
        },
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": "What is the top stock by closing price?"}],
            }
        ],
    }
)
for event in events:
    if event.get("event") == EventType.RESPONSE_TEXT_DELTA:
        print(event.get("text", ""), end="", flush=True)
    elif event.get("event") == EventType.RESPONSE:
        print()

# 3. Describe the thread to see persisted messages. `threads.messages()` is an
#    alias for `describe()` — both hit the same endpoint and return the same body.
detail = client.threads.describe(thread_id, page_size=20)
detail_via_alias = client.threads.messages(thread_id, page_size=20)
print(
    f"\nthreads.describe returned {len(detail.get('messages') or [])} msg(s), "
    f"threads.messages returned {len(detail_via_alias.get('messages') or [])} msg(s) (alias)"
)

for raw_message in detail.get("messages") or []:
    # ThreadMessageView parses `message_payload` and exposes the same typed
    # content accessors AgentResponseView does — historical turns look exactly
    # like fresh responses.
    view = ThreadMessageView(raw_message)
    print(f"\n--- #{view.message_id} [{view.role}] ---")
    print(f'  text: "{view.text}"')
    if view.role == "assistant":
        model = (view.tags or {}).get("model", "-")
        print(f"  status={view.status} schema={view.schema_version} model={model}")
    print(f"  content items: {len(view.content)}")
    for label, items in (
        ("text", view.texts),
        ("thinking", view.thinkings),
        ("tool_use", view.tool_uses),
        ("tool_result", view.tool_results),
        ("table", view.tables),
        ("suggested_queries", view.suggested_queries),
    ):
        for item in items:
            print(f"  [{label}]\n{json.dumps(item, indent=2)}")

# 4. Rename it
update_result = client.threads.update(thread_id, thread_name="Data warehouse explainer")
print(f"\nupdate status: {(update_result or {}).get('status')}")

# 5. Search across threads (fuzzy)
search_result = client.threads.search(query="data warehouse", limit=5)
print(f"search matched {len(search_result.get('threads') or [])} thread(s)")

# 6. List threads and clean up
listing = client.threads.list(page_size=5)
print(f"user has {len(listing.data)} thread(s) on first page")
client.threads.delete(thread_id)
print(f"deleted thread {thread_id}")
