"""Stream a lite agent run via the **raw event iterator**.

This is the lowest-level streaming path — as opposed to ``AgentRunStream``'s
callback API (see ``lite_agent_streaming.py``). The prompt configures inline
tools (analyst + cortex_search) so most event types actually fire: text,
thinking, tool_use, tool_result, table, suggested_queries, status, metadata,
response.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/stream_agent_run.py
"""

from __future__ import annotations

import os
import sys

from cortex_agent_sdk.api import CortexAgentClient, EventType

client = CortexAgentClient(
    base_url=f"https://{os.environ['SNOWFLAKE_HOST']}" if os.getenv("SNOWFLAKE_HOST") else None,
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

semantic_view = os.getenv("SNOWFLAKE_SEMANTIC_VIEW", "SNOWFLAKE_INTELLIGENCE.PUBLIC.STOCKS_DATA")
search_service = os.getenv(
    "SNOWFLAKE_SEARCH_SERVICE", "A11NSCHARFE.WIKIPEDIA_SEARCH.WIKIPEDIA_SEARCH_SERVICE"
)
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

events = client.agent.run(
    {
        "models": {"orchestration": "auto"},
        "instructions": {
            "orchestration": "Use analyst for stock questions, wikipedia for general knowledge.",
            "response": "Be concise.",
        },
        "tools": [
            {
                "tool_spec": {
                    "type": "cortex_analyst_text_to_sql",
                    "name": "analyst",
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
            "analyst": {
                "semantic_view": semantic_view,
                "execution_environment": {"type": "warehouse", "warehouse": warehouse},
            },
            "wikipedia": {"search_service": search_service, "max_results": 3},
        },
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": "Show me the top 3 stocks by closing price."}],
            }
        ],
    }
)

for event in events:
    kind = event.get("event")
    if kind == EventType.RESPONSE_TEXT_DELTA:
        print(event.get("text", ""), end="", flush=True)
    elif kind == EventType.RESPONSE_TEXT:
        print(f"\n[text] complete ({len(event.get('text') or '')} chars)")
    elif kind == EventType.RESPONSE_THINKING_DELTA:
        # Suppress thinking chunks; the aggregated block is logged on completion.
        pass
    elif kind == EventType.RESPONSE_THINKING:
        text = event.get("text") or ""
        print(f"[thinking] {text[:80]}{'...' if len(text) > 80 else ''}")
    elif kind == EventType.RESPONSE_TOOL_USE:
        print(f"[tool_use] name={event.get('name')} type={event.get('type')}")
    elif kind == EventType.RESPONSE_TOOL_RESULT:
        print(f"[tool_result] name={event.get('name')} status={event.get('status')}")
    elif kind == EventType.RESPONSE_TABLE:
        print(f"[table] query_id={event.get('query_id')} tool_use_id={event.get('tool_use_id')}")
    elif kind == EventType.RESPONSE_SUGGESTED_QUERIES:
        print(f"[suggested_queries] {len(event.get('suggested_queries') or [])} follow-ups")
    elif kind == EventType.RESPONSE_STATUS:
        print(f"[status] {event.get('status')}: {event.get('message')}")
    elif kind == EventType.METADATA:
        metadata = event.get("metadata") or {}
        print(f"[metadata] role={metadata.get('role')} run_id={metadata.get('run_id') or '-'}")
    elif kind == EventType.ERROR:
        print(f"  [error] {event.get('message')}", file=sys.stderr)
    elif kind == EventType.RESPONSE:
        print(f"\n[response] status={event.get('status') or '-'}")
