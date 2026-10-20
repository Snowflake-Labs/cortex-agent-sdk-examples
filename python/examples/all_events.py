"""Every ``StreamEvent`` callback channel available on ``AgentRunStream``.

Uses a named data agent so every v2 event type has a chance to fire
(``response.status``, ``response.thinking.delta``, ``response.tool_use``,
``response.tool_result.status``, ...).

The second half re-runs the same prompt through the raw iterator and tallies
event counts, which is the quickest way to see what a given agent actually emits.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/all_events.py
"""

from __future__ import annotations

import os
import sys
from collections import Counter

from cortex_agent_sdk.api import (
    AgentEvent,
    CortexAgentClient,
    EventType,
    StreamEvent,
)

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

# Create an agent bound to a semantic view so runs actually exercise tool_use,
# tool_result, analyst deltas, and table events — not just text/thinking.
agent = {
    "database": os.environ["SNOWFLAKE_DATABASE"],
    "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
    "name": f"SDK_ALL_EVENTS_EXAMPLE_{os.getpid()}",
}
semantic_view = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

create_result = client.agent.create(
    {
        "name": agent["name"],
        "models": {"orchestration": "auto"},
        "instructions": {
            "orchestration": "Use the analyst tool for questions about stocks.",
            "response": "Be concise, answer with 1-2 sentences.",
        },
        "tools": [
            {
                "tool_spec": {
                    "type": "cortex_analyst_text_to_sql",
                    "name": "analyst",
                    "description": "Query stock data",
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
    target={"database": agent["database"], "schema": agent["schema"]},
    create_mode="orReplace",
)
print(
    f"Created agent {agent['database']}.{agent['schema']}.{agent['name']} "
    f"({(create_result or {}).get('status')})\n"
)

try:
    # --- Example 1: every callback channel, against a data agent ---
    print("=== All StreamEvent callbacks (data agent / spec events) ===")
    print(f"  agent: {agent['database']}.{agent['schema']}.{agent['name']}\n")

    stream = client.agent.stream_data(
        {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Show me the top 5 stocks by closing price."}
                    ],
                }
            ]
        },
        target=agent,
    )

    def on_thinking(delta: str, accumulated: str) -> None:
        if len(accumulated) == len(delta):
            print("  [thinking] ", end="", flush=True)
        print(delta, end="", flush=True)

    def on_annotation(event: AgentEvent) -> None:
        print(f"  [annotation] index={event.get('annotation_index')} {event.get('annotation')}")

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
                f"  [tool_use] name={e.get('name')} type={e.get('type')} id={e.get('tool_use_id')}"
            ),
        )
        .on(
            StreamEvent.TOOL_USE_STATUS,
            lambda e: print(f"  [tool_use_status] {e.get('status')}: {e.get('message')}"),
        )
        .on(
            StreamEvent.TOOL_RESULT,
            lambda e: print(f"  [tool_result] status={e.get('status')} name={e.get('name')}"),
        )
        .on(
            StreamEvent.TOOL_RESULT_STATUS,
            lambda e: print(
                f"  [tool_result_status] {e.get('status')}: {e.get('message')} "
                f"(tool={e.get('tool_type')})"
            ),
        )
        .on(StreamEvent.ANALYST_DELTA, lambda delta, _acc: print(delta, end="", flush=True))
        .on(StreamEvent.SQL_EXPLANATION_DELTA, lambda delta, _acc: print(delta, end="", flush=True))
        .on(StreamEvent.SUMMARIZATION, lambda e: print(f"  [summarization] {e.get('summary')}"))
        .on(
            StreamEvent.TABLE,
            lambda e: print(
                f"  [table] tool_use_id={e.get('tool_use_id')} query_id={e.get('query_id')}"
            ),
        )
        .on(StreamEvent.CHART, lambda e: print(f"  [chart] tool_use_id={e.get('tool_use_id')}"))
        .on(
            StreamEvent.ASSET,
            lambda e: print(
                f"  [asset] path={e.get('path')} description={e.get('description') or '(none)'}"
            ),
        )
        .on(StreamEvent.WARNING, lambda e: print(f"  [warning] {e.get('message')}"))
        .on(StreamEvent.ANNOTATION, on_annotation)
        .on(
            StreamEvent.SUBAGENT,
            lambda e: print(f"  [subagent] subagent_id={e.get('subagent_id')}"),
        )
        .on(
            StreamEvent.GUARDRAILS,
            lambda e: print(f"  [guardrails] risk={e.get('risk')} message={e.get('message')}"),
        )
        .on(
            StreamEvent.SUGGESTED_QUERIES,
            lambda e: print(f"  [suggested_queries] count={len(e.get('suggested_queries') or [])}"),
        )
        .on(
            StreamEvent.EXECUTION_TRACE,
            lambda e: print(f"  [execution_trace] spans={len(e.get('traces') or [])}"),
        )
        .on(StreamEvent.DEBUG, lambda delta, _acc: print(f"  [debug] {delta}", file=sys.stderr))
        .on(
            StreamEvent.METADATA,
            lambda e: print(
                f"  [metadata] run_id={(e.get('metadata') or {}).get('run_id')} "
                f"role={(e.get('metadata') or {}).get('role')}"
            ),
        )
        .on(StreamEvent.ERROR, lambda err: print(f"  [error] {err}", file=sys.stderr))
        .on(
            StreamEvent.END,
            lambda e: print(f"  [end] stream completed (status={e.get('status') or '-'})"),
        )
    )

    stream.done()

    print("\n  --- Accumulated state ---")
    print(f"  current_text:     {len(stream.current_text)} chars")
    print(f"  current_thinking: {len(stream.current_thinking)} chars")
    print(f"  current_analyst:  {len(stream.current_analyst)} chars")

    # --- Example 2: raw iteration with EventType, tallying what arrived ---
    print("\n\n=== Raw event log (iterator) ===")
    counts: Counter[str] = Counter()
    chars = {"text": 0, "thinking": 0, "analyst": 0, "sql_explanation": 0, "debug": 0}
    for event in client.agent.run_data(
        {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "What are the top 3 stocks by closing price?"}
                    ],
                }
            ]
        },
        target=agent,
    ):
        kind = event.get("event", "")
        counts[kind] += 1
        if kind == EventType.RESPONSE_TEXT_DELTA:
            chars["text"] += len(event.get("text") or "")
        elif kind == EventType.RESPONSE_THINKING_DELTA:
            chars["thinking"] += len(event.get("text") or "")
        elif kind == EventType.RESPONSE_TOOL_RESULT_ANALYST_DELTA:
            chars["analyst"] += len((event.get("delta") or {}).get("text") or "")
        elif kind == EventType.RESPONSE_TOOL_RESULT_SQL_EXPLANATION_DELTA:
            chars["sql_explanation"] += len((event.get("delta") or {}).get("text") or "")
        elif kind == EventType.DEBUG_DELTA:
            chars["debug"] += len(event.get("text") or event.get("content") or "")
        elif kind == EventType.ERROR:
            print(
                f"\n  [error frame] code={event.get('code')} message={event.get('message')}",
                file=sys.stderr,
            )

    print("  Streamed chars: " + " ".join(f"{k}={v}" for k, v in chars.items()))
    print("\n  Event type counts:")
    for kind, count in counts.most_common():
        print(f"    {kind}: {count}")
finally:
    delete_result = client.agent.delete(target=agent, if_exists=True)
    print(f"\nDeleted agent {agent['name']} ({(delete_result or {}).get('status')})")
