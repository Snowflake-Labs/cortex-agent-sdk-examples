"""Tool use with the Cortex Analyst (text-to-SQL) tool.

Two v2 paths:
  1. Lite agent with inline tool/tool_resources — configure the analyst tool
     per request.
  2. Named data agent — the analyst tool is baked into the agent definition.

Both emit the same v2 spec events (``response.tool_use``,
``response.tool_result``, ...).

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/tool_use_analyst.py
"""

from __future__ import annotations

import os
import sys

from cortex_agent_sdk.api import AgentEvent, CortexAgentClient, StreamEvent

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

semantic_view = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

# --- Example 1: lite agent path with inline tool/tool_resources ---
print("=== Analyst tool — lite agent path (inline tool config) ===")
print(f"  semantic_view: {semantic_view}\n")

stream = client.agent.stream(
    {
        "models": {"orchestration": "auto"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What are the top 5 stocks by closing price?"}
                ],
            }
        ],
        "tools": [{"tool_spec": {"type": "cortex_analyst_text_to_sql", "name": "analyst"}}],
        "tool_resources": {
            "analyst": {
                "semantic_view": semantic_view,
                # Required: without an execution environment the server rejects
                # the tool with 391920 ("missing an execution environment"), which
                # arrives as an error *event* rather than a raised exception.
                "execution_environment": {"type": "warehouse", "warehouse": warehouse},
            }
        },
    }
)


def on_tool_use(event: AgentEvent) -> None:
    print(f"  [tool_use] name={event.get('name')} type={event.get('type')}")
    print(f"    tool_use_id: {event.get('tool_use_id')}")
    query = (event.get("input") or {}).get("query")
    if isinstance(query, str):
        print(f'    query: "{query}"')


def on_tool_result(event: AgentEvent) -> None:
    print(f"  [tool_result] status={event.get('status')} name={event.get('name')}")
    for item in event.get("content") or []:
        if item.get("type") == "json":
            payload = item.get("json") or {}
            print(f"    sql: {payload.get('sql')}")
            print(f"    interpretation: {payload.get('text')}")
            print(f"    verified_query: {payload.get('verified_query_used')}")


stream.on(StreamEvent.STATUS, lambda e: print(f"  [status] {e.get('status')}: {e.get('message')}"))
stream.on(StreamEvent.TOOL_USE, on_tool_use)
stream.on(StreamEvent.TOOL_RESULT, on_tool_result)
stream.on(
    StreamEvent.TOOL_RESULT_STATUS,
    lambda e: print(
        f"  [tool_result_status] {e.get('status')}: {e.get('message')} (tool={e.get('tool_type')})"
    ),
)
stream.on(StreamEvent.TEXT, lambda delta, _acc: print(delta, end="", flush=True))
stream.on(StreamEvent.ERROR, lambda err: print(f"  [error] {err}", file=sys.stderr))
stream.done()
print("\n")

# --- Example 2: named agent path (tool baked into the agent) ---
print("=== Analyst tool — named agent path ===")
agent = {
    "database": os.environ["SNOWFLAKE_DATABASE"],
    "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
    "name": os.getenv("SNOWFLAKE_AGENT", f"SDK_ANALYST_EXAMPLE_{os.getpid()}"),
}
print(f"  agent: {agent['database']}.{agent['schema']}.{agent['name']}\n")

client.agent.create(
    {
        "name": agent["name"],
        "models": {"orchestration": "auto"},
        "instructions": {
            "orchestration": "Use the analyst tool for stock questions.",
            "response": "Be concise.",
        },
        "tools": [{"tool_spec": {"type": "cortex_analyst_text_to_sql", "name": "analyst"}}],
        "tool_resources": {
            "analyst": {
                "semantic_view": semantic_view,
                "execution_environment": {"type": "warehouse", "warehouse": warehouse},
            }
        },
    },
    target={"database": agent["database"], "schema": agent["schema"]},
    create_mode="orReplace",
)

try:
    stream2 = client.agent.stream_data(
        {
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "What data can you analyze for me?"}],
                }
            ]
        },
        target=agent,
    )

    def on_thinking(delta: str, accumulated: str) -> None:
        if len(accumulated) == len(delta):
            print("  [thinking] ", end="", flush=True)
        print(delta, end="", flush=True)

    stream2.on(
        StreamEvent.STATUS, lambda e: print(f"  [status] {e.get('status')}: {e.get('message')}")
    )
    stream2.on(StreamEvent.THINKING, on_thinking)
    stream2.on(StreamEvent.THINKING_COMPLETE, lambda _e: print())
    stream2.on(
        StreamEvent.TOOL_USE,
        lambda e: print(
            f"  [tool_use] name={e.get('name')} type={e.get('type')} id={e.get('tool_use_id')}"
        ),
    )
    stream2.on(
        StreamEvent.TOOL_RESULT_STATUS,
        lambda e: print(f"  [tool_result_status] {e.get('status')}: {e.get('message')}"),
    )
    stream2.on(StreamEvent.TEXT, lambda delta, _acc: print(delta, end="", flush=True))
    stream2.on(StreamEvent.END, lambda _e: print("\n  [end] stream completed"))
    stream2.done()
finally:
    client.agent.delete(target=agent, if_exists=True)
    print(f"\nDeleted agent {agent['name']}")
