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

"""Non-streaming agent runs — lite, data agent, and background.

Non-streaming mode returns the complete response in a single JSON payload.
Useful when you need the whole response before processing (structured output,
batch jobs, or anywhere latency to first token does not matter).

Adding ``background: True`` returns immediately with an ``BackgroundRun`` handle
instead of waiting.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/non_streaming.py
"""

from __future__ import annotations

import os

from snowflake.cortex.agents import CortexAgentAPIError
from snowflake.cortex.agents.api import AgentResponseView, CortexAgentClient

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

# --- Example 1: Lite agent, non-streaming ---
print("=== Lite agent (non-streaming) ===")
try:
    response = client.agent.run(
        {
            "models": {"orchestration": "auto"},
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "What is 2+2? Reply with just the number."}
                    ],
                }
            ],
            "stream": False,
        }
    )
    assert isinstance(response, AgentResponseView)
    print(f"  role: {response.role}")
    print(f"  content items: {len(response.content)}")
    print(f'  text: "{response.text}"')
    print(f"  run_id: {response.run_id}")
except CortexAgentAPIError as err:
    print(f"  Note: non-streaming not supported on this host ({type(err).__name__}: {err})")
    print(f"  request_id: {err.request_id}")

# --- Example 2: Non-streaming with request_with_response (get headers) ---
print("\n=== Non-streaming + request_with_response ===")
try:
    result = client.request_with_response(
        "POST",
        "/api/v2/cortex/agent:run",
        json_body={
            "models": {"orchestration": "auto"},
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "Name one color."}]}
            ],
            "stream": False,
        },
    )
    print(f"  x-snowflake-request-id: {result.request_id}")
    # request_with_response is the low-level path — it returns the raw
    # AgentResponse body. Wrap it in AgentResponseView for typed accessors.
    print(f'  text: "{AgentResponseView(result.response_body).text}"')
except CortexAgentAPIError as err:
    print(f"  Note: non-streaming not supported on this host ({type(err).__name__})")

# --- Example 3: Data agent, non-streaming ---
print("\n=== Data agent (non-streaming) ===")
target = {
    "database": os.environ["SNOWFLAKE_DATABASE"],
    "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
    "name": f"SDK_NONSTREAMING_EXAMPLE_{os.getpid()}",
}
semantic_view = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

create_result = client.agent.create(
    {
        "name": target["name"],
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
    },
    target={"database": target["database"], "schema": target["schema"]},
    create_mode="orReplace",
)
print(
    f"  created {target['database']}.{target['schema']}.{target['name']} "
    f"({(create_result or {}).get('status')})"
)

try:
    data_response = client.agent.run_data(
        {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Show me the top 3 stocks by closing price."}
                    ],
                }
            ],
            "stream": False,
        },
        target=target,
    )
    assert isinstance(data_response, AgentResponseView)
    print(f'  text: "{data_response.text.strip()}"')
    print(f"  content items: {len(data_response.content)}")
    print(f"  tool_uses: {len(data_response.tool_uses)}")
    print(f"  tool_results: {len(data_response.tool_results)}")
    tables = data_response.tables
    print(f"  tables: {len(tables)}")

    # --- Example 4: Background run — returns an BackgroundRun handle ---
    print("\n=== Background run (stream=False, background=True -> BackgroundRun) ===")
    thread = client.threads.create(origin_application="sdk-nonstreaming")
    try:
        run = client.agent.run_data(
            {
                "messages": [
                    {"role": "user", "content": [{"type": "text", "text": "One line about TSLA."}]}
                ],
                "thread_id": thread["thread_id"],
                "parent_message_id": 0,
                "stream": False,
                "background": True,
            },
            target=target,
        )
        print(f"  kickoff: status={run.initial_status} run_id={run.run_id}")
        view = run.wait()
        print(f"  view.role:           {view.role}")
        print(f"  view.text:           {view.text.strip()[:200]}")
        print(f"  view.content items:  {len(view.content)}")
        print(f"  view.metadata run_id: {view.run_id or '-'}")
        print(
            f"  view.events:         "
            f"{len(view.events) if view.events is not None else '(from thread, no events)'}"
        )
    finally:
        client.threads.delete(thread["thread_id"])
        print(f"  deleted thread {thread['thread_id']}")
finally:
    client.agent.delete(target=target, if_exists=True)
    print(f"\n  deleted agent {target['name']}")
