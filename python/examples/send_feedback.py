"""Run a data agent, capture its request_id, then send feedback tied to it.

The feedback endpoint keys off ``request_id`` — the value of the
``x-snowflake-request-id`` header on the run's HTTP response — **not** a
``run_id`` from an SSE metadata event. ``AgentRunStream.request_id`` exposes it
once the response headers arrive (safe to read after ``done()``).

Creates its own data agent with a ``cortex_analyst_text_to_sql`` tool so the
example is self-contained.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/send_feedback.py
"""

from __future__ import annotations

import os
import sys

from cortex_agent_sdk.api import CortexAgentClient, StreamEvent

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

target = {
    "database": os.environ["SNOWFLAKE_DATABASE"],
    "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
    "name": f"SDK_FEEDBACK_EXAMPLE_{os.getpid()}",
}
semantic_view = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

client.agent.create(
    {
        "name": target["name"],
        "models": {"orchestration": "auto"},
        "instructions": {"orchestration": "Use the analyst tool.", "response": "Be concise."},
        "tools": [{"tool_spec": {"type": "cortex_analyst_text_to_sql", "name": "analyst"}}],
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
print(f"Created data agent {target['name']}")

try:
    stream = client.agent.stream_data(
        {
            "messages": [
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "What can you help me with?"}],
                }
            ]
        },
        target=target,
    )
    stream.on(StreamEvent.TEXT, lambda delta, _acc: print(delta, end="", flush=True))
    stream.on(StreamEvent.ERROR, lambda err: print(f"\n  [error] {err}", file=sys.stderr))
    stream.done()
    print()

    request_id = stream.request_id
    if not request_id:
        print("No request_id captured — cannot attach feedback.")
        raise SystemExit(1)

    print(f"\nrequest_id: {request_id}")

    result = client.feedback.send(
        target=target,
        request_id=request_id,
        positive=True,
        feedback_message="Great response!",
        categories=["helpful"],
    )
    print(f"feedback recorded for request {request_id} (status: {(result or {}).get('status')})")
finally:
    client.agent.delete(target=target, if_exists=True)
    print(f"Deleted agent {target['name']}")
