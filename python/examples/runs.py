"""Every ``client.runs.*`` method exercised against a real background run.

    client.runs.stream(run_id, starting_after=...)   raw Iterator[AgentEvent]
    client.runs.resume(run_id, starting_after=...)   AgentRunStream (callback API)
    client.runs.cancel(run_id)                       cancel; partial output is saved

``stream`` and ``resume`` hit the same endpoint
(``GET /api/v2/cortex/agent/runs/{run_id}``); they differ only in the client-side
wrapper. ``starting_after`` skips events before a given sequence number — handy
for reconnecting mid-run without replaying from scratch.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/runs.py
"""

from __future__ import annotations

import os

from cortex_agent_sdk import CortexAgentAPIError
from cortex_agent_sdk.api import CortexAgentClient, StreamEvent

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

# --- Setup: create a data agent so the cancel section (which needs a
#     long-running streaming run) reliably hits v2 and emits text deltas. ---
data_agent = {
    "database": os.environ["SNOWFLAKE_DATABASE"],
    "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
    "name": f"SDK_RUNS_EXAMPLE_{os.getpid()}",
}
semantic_view = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
warehouse = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")

client.agent.create(
    {
        "name": data_agent["name"],
        "models": {"orchestration": "auto"},
        "instructions": {"orchestration": "Answer thoroughly.", "response": "Be verbose."},
        "tools": [{"tool_spec": {"type": "cortex_analyst_text_to_sql", "name": "analyst"}}],
        "tool_resources": {
            "analyst": {
                "semantic_view": semantic_view,
                "execution_environment": {"type": "warehouse", "warehouse": warehouse},
            }
        },
    },
    target={"database": data_agent["database"], "schema": data_agent["schema"]},
    create_mode="orReplace",
)
print(f"Created data agent {data_agent['name']}")

thread = client.threads.create(origin_application="sdk-runs-ex")
print(f"Created thread {thread['thread_id']}")

kickoff = client.agent.run(
    {
        "models": {"orchestration": "auto"},
        "thread_id": thread["thread_id"],
        "parent_message_id": 0,
        "background": True,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": "In one sentence, what is Snowflake?"}],
            }
        ],
    }
)
run_id = kickoff.run_id
print(f"Kicked off background run {run_id} (status: {kickoff.initial_status})\n")

# === 0. BackgroundRun.wait() -> materialize the final AgentResponseView ===
# Higher-level than runs.stream/resume: waits for the run to complete and returns
# a typed view over the final content. It tries the live stream once, then falls
# back to the committed thread reply if live access is unavailable.
print("=== 0. BackgroundRun.wait() -> AgentResponseView ===")
kickoff_view = kickoff.wait()
print(f"  view.role:            {kickoff_view.role}")
print(f"  view.text:            {kickoff_view.text.strip()}")
print(f"  view.content items:   {len(kickoff_view.content)}")
print(f"  view.texts:           {len(kickoff_view.texts)}")
print(f"  view.tool_uses:       {len(kickoff_view.tool_uses)}")
print(f"  view.tool_results:    {len(kickoff_view.tool_results)}")
print(f"  view.metadata run_id: {kickoff_view.run_id or '-'}")
print(
    f"  view.events:          "
    f"{len(kickoff_view.events) if kickoff_view.events is not None else '(from thread, no events)'}\n"
)

# === 1. runs.stream — raw iteration; count events, track the highest seq no ===
print("=== 1. runs.stream (raw iterator) ===")
first_stream_count = 0
highest_seq = 0
kinds: set[str] = set()
for event in client.runs.stream(run_id):
    first_stream_count += 1
    kinds.add(event.get("event", ""))
    seq = event.get("sequence_number")
    if isinstance(seq, int) and seq > highest_seq:
        highest_seq = seq
print(
    f"  drained {first_stream_count} events, kinds=[{', '.join(sorted(kinds))}], "
    f"highest seq={highest_seq}"
)

# === 2. runs.resume — same endpoint, wrapped as AgentRunStream ===
print("\n=== 2. runs.resume (AgentRunStream wrapper) ===")
resumed = client.runs.resume(run_id)
resumed.on(StreamEvent.TEXT, lambda delta, _acc: print(delta, end="", flush=True))
resumed.on(StreamEvent.END, lambda _e: print("\n  [end] fired"))
print("  text: ", end="", flush=True)
resumed.done()
print(f"  final text length: {len(resumed.current_text)} chars")

# === 3. runs.stream with starting_after — skip already-seen events ===
print("\n=== 3. runs.stream with starting_after ===")
midpoint = highest_seq // 2
tail_count = sum(1 for _ in client.runs.stream(run_id, starting_after=midpoint))
print(
    f"  starting_after={midpoint}: got {tail_count} events (vs {first_stream_count} from the start)"
)

# === 4. runs.cancel — only meaningful for background runs.
#     Cancel signals the worker to stop; it does NOT abort a foreground
#     stream=True call (that is what the cancel event / stream.abort() is for,
#     and those just close the client's HTTP socket). A background run's
#     execution is decoupled from the HTTP request, so the endpoint is the only
#     way to reach the worker. ===
print("\n=== 4. runs.cancel (background run) ===")
bg_long = client.agent.run_data(
    {
        "thread_id": thread["thread_id"],
        "parent_message_id": 0,
        "background": True,
        "stream": False,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Write a very long, detailed essay about distributed systems.",
                    }
                ],
            }
        ],
    },
    target=data_agent,
)
print(f"  kicked off background run: status={bg_long.initial_status} run_id={bg_long.run_id}")

# Cancel via the BackgroundRun handle (equivalent to client.runs.cancel(run_id)).
cancel_result = bg_long.cancel()
assistant_message_id = ((cancel_result.response_body or {}).get("metadata") or {}).get(
    "assistant_message_id"
)
print(f"  cancel returned: assistant_message_id={assistant_message_id or '-'}")

# Reconnect and see what got persisted — partial output is saved to the thread on
# cancel, and assistant_message_id above is that message.
try:
    post = client.runs.resume(bg_long.run_id)
    post.done()
    print(f"  post-cancel replay: {len(post.current_text)} chars streamed")
except CortexAgentAPIError as err:
    print(f"  post-cancel replay threw: HTTP {err.status}")

# --- Cleanup ---
client.threads.delete(thread["thread_id"])
client.agent.delete(target=data_agent, if_exists=True)
print(f"\nDeleted thread {thread['thread_id']} + agent {data_agent['name']}")
