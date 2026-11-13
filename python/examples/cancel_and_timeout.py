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

"""Cancellation and timeout patterns.

Python has no ``AbortSignal``, so the SDK uses a ``threading.Event`` as the
cancellation token. Set the event and the request aborts before its next attempt;
an in-flight SSE stream stops at the next event boundary.

Three patterns:
  1. a ``threading.Event`` cancelled by a timer
  2. ``AgentRunStream.abort()`` from inside a callback
  3. a per-request ``timeout``

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/cancel_and_timeout.py
"""

from __future__ import annotations

import os
import threading

from snowflake.cortex.agents import (
    APIConnectionAbortedError,
    CortexAgentError,
)
from snowflake.cortex.agents.api import CortexAgentClient, StreamEvent

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
    timeout=30.0,
)

body = {
    "models": {"orchestration": "auto"},
    "messages": [
        {
            "role": "user",
            "content": [{"type": "text", "text": "Write a 500 word essay about databases."}],
        }
    ],
}

# --- Example 1: cancellation event tripped by a timer ---
print("=== threading.Event (cancel after 2s) ===")
cancel = threading.Event()
threading.Timer(2.0, cancel.set).start()

stream1 = client.agent.stream(body, options={"cancel": cancel})
stream1.on(StreamEvent.TEXT, lambda delta, _acc: print(delta, end="", flush=True))
try:
    stream1.done()
except APIConnectionAbortedError as err:
    print(f"\n[Cancelled: {err}]")

# --- Example 2: AgentRunStream.abort() from a callback ---
# Note: some servers deliver the whole response in a single SSE event (legacy
# format), so the first delta may already exceed the limit. stdout is capped to
# show the intent.
print("\n\n=== AgentRunStream.abort() (abort after 50 chars) ===")
printed = 0
stream2 = client.agent.stream(body)


def print_capped(delta: str, accumulated: str) -> None:
    global printed
    remaining = 50 - printed
    if remaining > 0:
        chunk = delta[:remaining]
        print(chunk, end="", flush=True)
        printed += len(chunk)
    if len(accumulated) > 50:
        stream2.abort()


stream2.on(StreamEvent.TEXT, print_capped)
try:
    stream2.done()
except APIConnectionAbortedError:
    print("\n[Stream aborted via .abort()]")

# --- Example 3: per-request timeout ---
print("\n\n=== Per-request timeout (0.1s — will likely fail) ===")
try:
    client.agent.run({**body, "stream": False}, options={"timeout": 0.1, "max_retries": 0})
except CortexAgentError as err:
    print(f"[Timeout error: {type(err).__name__} — {err}]")
