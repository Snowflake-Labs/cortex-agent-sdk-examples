"""Rich lite-agent streaming — an inline agent spec run through the callback API.

A "lite" agent has the same shape as a saved data agent, except the agent spec
(models, instructions, tools, tool_resources) lives inline in the request body
instead of being registered ahead of time via ``agent.create()``. Everything
else — endpoint semantics, event stream, response shape — is identical.

This example registers a callback on every channel that a tool-using run
exercises, then drains the stream with ``final_text()``.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/lite_agent_streaming.py
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
search_service = os.environ["SNOWFLAKE_SEARCH_SERVICE"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

print("=== Lite agent with inline tools (analyst + cortex_search) ===")
print(f"  semantic_view:  {semantic_view}")
print(f"  search_service: {search_service}\n")

stream = client.agent.stream(
    {
        "models": {"orchestration": "auto"},
        "instructions": {
            "orchestration": (
                "Use the stocks_analyst tool for stock-price questions. "
                "Use wikipedia for general knowledge lookups."
            ),
            "response": "Be concise. Cite which tool produced each fact.",
        },
        "tools": [
            {
                "tool_spec": {
                    "type": "cortex_analyst_text_to_sql",
                    "name": "stocks_analyst",
                    "description": "Query stock prices/symbols from the STOCKS_DATA semantic view",
                }
            },
            {
                "tool_spec": {
                    "type": "cortex_search",
                    "name": "wikipedia",
                    "description": "Search Wikipedia for general knowledge topics",
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
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Find the top 3 stocks by closing price, then search Wikipedia "
                            "for a one-sentence summary of the highest-priced stock's company."
                        ),
                    }
                ],
            }
        ],
    }
)


def on_thinking(delta: str, accumulated: str) -> None:
    if len(accumulated) == len(delta):
        print("  [thinking] ", end="", flush=True)
    print(delta, end="", flush=True)


def on_suggested_queries(event: AgentEvent) -> None:
    queries = event.get("suggested_queries") or []
    print(f"  [suggested_queries] {len(queries)} follow-up(s)")
    for query in queries:
        print(f"    - {query.get('query')}")


(
    stream.on(
        StreamEvent.STATUS,
        lambda e: print(f"  [status] {e.get('status')}: {e.get('message')}"),
    )
    .on(StreamEvent.THINKING, on_thinking)
    .on(
        StreamEvent.THINKING_COMPLETE,
        lambda e: print(f"\n  [thinking complete] ({len(e.get('text') or '')} chars)"),
    )
    .on(StreamEvent.TEXT, lambda delta, _acc: print(delta, end="", flush=True))
    .on(
        StreamEvent.TEXT_COMPLETE,
        lambda e: print(f"\n  [text complete] ({len(e.get('text') or '')} chars)"),
    )
    .on(
        StreamEvent.TOOL_USE,
        lambda e: print(
            f"  [tool_use] name={e.get('name')} type={e.get('type')} id={e.get('tool_use_id')}\n"
            f"    input={e.get('input')}"
        ),
    )
    .on(
        StreamEvent.TOOL_USE_STATUS,
        lambda e: print(f"  [tool_use_status] {e.get('status')}: {e.get('message')}"),
    )
    .on(
        StreamEvent.TOOL_RESULT,
        lambda e: print(
            f"  [tool_result] status={e.get('status')} name={e.get('name')} "
            f"({len(e.get('content') or [])} content item(s))"
        ),
    )
    .on(
        StreamEvent.TOOL_RESULT_STATUS,
        lambda e: print(
            f"  [tool_result_status] {e.get('status')}: {e.get('message')} "
            f"(tool={e.get('tool_type')})"
        ),
    )
    .on(
        StreamEvent.TABLE,
        lambda e: print(
            f"  [table] tool_use_id={e.get('tool_use_id')} query_id={e.get('query_id')}"
        ),
    )
    .on(StreamEvent.SUGGESTED_QUERIES, on_suggested_queries)
    .on(
        StreamEvent.METADATA,
        lambda e: print(
            f"  [metadata] run_id={(e.get('metadata') or {}).get('run_id')} "
            f"role={(e.get('metadata') or {}).get('role')}"
        ),
    )
    .on(StreamEvent.ERROR, lambda err: print(f"  [error] {err}", file=sys.stderr))
    .on(StreamEvent.END, lambda e: print(f"  [end] stream completed (status={e.get('status')})"))
)

final_text = stream.final_text()
print(f"\n=== Final answer ({len(final_text)} chars) ===")
print(final_text)
