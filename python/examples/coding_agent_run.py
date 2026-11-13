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

"""First-class coding-agent support via ``client.coding_agent.*``.

Sections:
  1. streaming run with ``permission_policy="always_allow"`` — wire-level check
     that no permission prompt fires
  2. non-streaming run, plus ``expand_coding_agent_request`` to inspect the exact
     wire payload before it is sent
  3. ``workspace_mounts`` — write a marker file into the mounted workspace
  4. multi-turn via ``Conversation.send`` — the workspace persists
     across turns *and* across threads (workspace scope is user-level)
  4b. ``coding_agent.run(stream=True)`` — the raw event iterator
  4c. ``coding_agent.run(background=True)`` — a ``BackgroundRun`` handle
  5. client-side validation that never reaches the wire

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/coding_agent_run.py
"""

from __future__ import annotations

import os
import re
import time
from collections import Counter

from snowflake.cortex.agents import (
    Conversation,
    CortexAgentError,
)
from snowflake.cortex.agents.api import (
    AgentEvent,
    AgentResponseView,
    CortexAgentClient,
    StreamEvent,
    expand_coding_agent_request,
)

_RETURNED_OUTPUT = re.compile(r"returned output:\s?(.*)", re.DOTALL)


def extract_bash_stdout(view: AgentResponseView) -> str:
    """Pull just the bash stdout out of successful tool_result content entries.

    Drops the ``Bash command `..` with description `..` returned output: `` prefix
    so the shell command's own echoed text is not mistaken for output. Failed
    commands are skipped.
    """
    parts: list[str] = []
    for item in view.tool_results:
        tool_result = item.get("tool_result") or {}
        if tool_result.get("status") != "success":
            continue
        for content in tool_result.get("content") or []:
            match = _RETURNED_OUTPUT.search(content.get("text") or "")
            if match:
                parts.append(match.group(1))
    return "\n".join(parts)


client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

workspace_fqn = os.getenv("SNOWFLAKE_WORKSPACE", "USER$MY_USER.PUBLIC.DEFAULT$")

# --- 1. Streaming run with always_allow — verify NO permission prompt fires ---
# Wire-level check: destructive-looking commands must run immediately, with no
# `permission` field on tool_use events and no `client_tool_use_request` status.
print("=== 1. coding_agent.stream — always_allow bash, no permission prompt ===")
stream1 = client.coding_agent.stream(
    {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "run this exact command in bash: "
                            "rm -rf /tmp/coding-agent-example-nonexistent"
                        ),
                    }
                ],
            }
        ],
        "permission_policy": "always_allow",
        "models": {"orchestration": "claude-sonnet-4-5"},
    }
)

saw_permission_prompt = False
saw_client_tool_use_request = False


def check_tool_use(event: AgentEvent) -> None:
    global saw_permission_prompt
    if event.get("permission"):
        saw_permission_prompt = True


def check_status(event: AgentEvent) -> None:
    global saw_client_tool_use_request
    if event.get("status") == "client_tool_use_request":
        saw_client_tool_use_request = True


stream1.on(StreamEvent.TOOL_USE, check_tool_use)
stream1.on(StreamEvent.STATUS, check_status)
text1 = stream1.final_text()
print(f"  final text: {text1.strip()}")
print(f"  request_id: {stream1.request_id}")
print(f"  wire check — permission field on tool_use? {saw_permission_prompt}  (expected: False)")
print(
    f"  wire check — client_tool_use_request status?  {saw_client_tool_use_request}  "
    f"(expected: False)"
)

# --- 2. Non-streaming run: inspect the wire shape + disabled_skills ---
print("\n=== 2. coding_agent.run non-streaming — expand_coding_agent_request + disabled_skills ===")

# expand_coding_agent_request is exported so callers can see exactly what the SDK
# puts on the wire before dispatching. Handy for debugging permission / mount
# configuration.
wire_shape = expand_coding_agent_request(
    {
        "messages": [{"role": "user", "content": [{"type": "text", "text": "hi"}]}],
        "permission_policy": "always_allow",
        "disabled_skills": ["dashboard"],
        "workspace_mounts": [{"name": workspace_fqn, "mount_path": "/workspace"}],
        "stage_skills": [{"name": "probe", "path": "@DB.SCHEMA.STAGE/skills/probe"}],
    }
)
print(f"  expanded tools:          {wire_shape['tools']}")
print(f"  expanded tool_resources: {wire_shape.get('tool_resources')}")
print(f"  expanded skills:         {wire_shape.get('skills')}")

view2 = client.coding_agent.run(
    {
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": "In one sentence, what tools do you have?"}],
            }
        ],
        "permission_policy": "always_allow",
        "disabled_skills": ["dashboard"],
        "models": {"orchestration": "claude-sonnet-4-5"},
        "stream": False,
    }
)
assert isinstance(view2, AgentResponseView)
print(f"  assistant reply: {view2.text.strip()}")

# --- 3. Workspace mount: wire shape plus a functional bash roundtrip ---
print("\n=== 3. coding_agent.run — workspace_mounts ===")
marker = f"CODING_AGENT_WS_{int(time.time() * 1000)}"
view3 = client.coding_agent.run(
    {
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"Write the text {marker} to "
                            f"/workspace/coding-agent-example.txt, then cat that file."
                        ),
                    }
                ],
            }
        ],
        "permission_policy": "always_allow",
        "workspace_mounts": [{"name": workspace_fqn, "mount_path": "/workspace"}],
        "models": {"orchestration": "claude-sonnet-4-5"},
        "stream": False,
    }
)
assert isinstance(view3, AgentResponseView)
bash_stdout = extract_bash_stdout(view3)
print(f"  wrote marker {marker} to /workspace/coding-agent-example.txt")
print(f"  marker roundtripped in bash stdout? {marker in bash_stdout}  (SDK path OK)")
print("  (real-mount proof is section 4: the same file read back across turns and threads)")
print(f"  bash stdout:\n{bash_stdout}")

# --- 4. Multi-turn via Conversation.send — workspace persists ---
print("\n=== 4. Conversation.send — persistence across turns ===")
thread1 = client.threads.create(origin_application="sdk-coco")
conversation_agent = {
    "type": "coding",
    "spec": {
        "permission_policy": "always_allow",
        "workspace_mounts": [{"name": workspace_fqn, "mount_path": "/workspace"}],
        "models": {"orchestration": "claude-sonnet-4-5"},
    },
}
convo = Conversation(client, thread1["thread_id"], agent=conversation_agent)
print(f"  created thread {convo.id}")

persistent_marker = f"CODING_AGENT_PERSIST_{int(time.time() * 1000)}"
turn1 = convo.send(f"Write the text {persistent_marker} to /workspace/persist.txt")
answer1 = turn1.result()
print(f"  turn 1 reply: {answer1.text}")

turn2 = convo.send("Run: cat /workspace/persist.txt")
answer2 = turn2.result()
print(f"  turn 2 reply: {answer2.text}")
print(f"  same-thread persistence? {persistent_marker in answer2.text}")

# Workspace scope is user-level, not thread-level, so a brand new thread should
# see the file written above.
#
# The write-back from the sandbox to the backing stage is asynchronous, so a read
# from a freshly-provisioned sandbox can land before the file has propagated.
# Retry a couple of times rather than reporting a race as a mount failure.
thread2 = client.threads.create(origin_application="sdk-coco-2")
convo2 = Conversation(client, thread2["thread_id"], agent=conversation_agent)
cross_thread_stdout = ""
attempts = 0
for attempt in range(1, 4):
    attempts = attempt
    cross_thread = convo2.send("Run: cat /workspace/persist.txt").result()
    # The marker can show up in bash stdout or only in the assistant's summary of
    # it, depending on how the model phrases the turn. Either counts as a read.
    cross_thread_stdout = extract_bash_stdout(cross_thread) or cross_thread.text
    if persistent_marker in cross_thread_stdout:
        break
    time.sleep(5)

print(
    f"  cross-thread persistence? {persistent_marker in cross_thread_stdout} "
    f"(after {attempts} attempt(s))"
)
print(f"  cross-thread output: {cross_thread_stdout.strip() or '(no successful commands)'}")

convo.delete()
convo2.delete()
print(f"  deleted threads {convo.id} and {convo2.id}")

# --- 4b. coding_agent.run with stream=True — the raw event iterator ---
# Same endpoint as coding_agent.stream, but yields events directly without the
# AgentRunStream wrapper.
print("\n=== 4b. coding_agent.run stream=True — raw iterator ===")
iter_counts: Counter[str] = Counter()
for event in client.coding_agent.run(
    {
        "messages": [{"role": "user", "content": [{"type": "text", "text": "Run: echo hello"}]}],
        "permission_policy": "always_allow",
        "models": {"orchestration": "claude-sonnet-4-5"},
        "stream": True,
    }
):
    iter_counts[event.get("event", "")] += 1
print(f"  drained {sum(iter_counts.values())} events, kinds=[{', '.join(sorted(iter_counts))}]")

# --- 4c. coding_agent.run with background=True — an BackgroundRun handle ---
print("\n=== 4c. coding_agent.run background=True -> BackgroundRun.wait() -> view ===")
bg_thread = client.threads.create(origin_application="sdk-code-bg")
try:
    bg_run = client.coding_agent.run(
        {
            "messages": [
                {"role": "user", "content": [{"type": "text", "text": "Run: echo background-ok"}]}
            ],
            "permission_policy": "always_allow",
            "models": {"orchestration": "claude-sonnet-4-5"},
            "thread_id": bg_thread["thread_id"],
            "parent_message_id": 0,
            "stream": False,
            "background": True,
        }
    )
    print(f"  kickoff: status={bg_run.initial_status} run_id={bg_run.run_id}")
    bg_view = bg_run.wait()
    print(f"  view.role:            {bg_view.role}")
    print(f"  view.text:            {bg_view.text.strip()[:200]}")
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

# --- 5. Client-side validation: rejected before anything reaches the wire ---
print("\n=== 5. Client-side validation ===")
for label, mounts in (
    ("nested mount_path", [{"name": workspace_fqn, "mount_path": "/workspace/nested"}]),
    ("empty workspace name", [{"name": ""}]),
):
    try:
        client.coding_agent.run(
            {
                "messages": [{"role": "user", "content": [{"type": "text", "text": "hi"}]}],
                "workspace_mounts": mounts,
                "stream": False,
            }
        )
        print(f"  UNEXPECTED: {label} was accepted")
    except CortexAgentError as err:
        print(f"  {label} rejected: {err}")
