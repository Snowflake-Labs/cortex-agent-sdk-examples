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

"""Run: python python/examples/bounded_replay.py (local HTTP fixture, no account credentials)."""

import asyncio
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from snowflake.cortex.agents.api import (
    AgentResponseView,
    AsyncBackgroundRun,
    AsyncCortexAgentClient,
    BackgroundRun,
    CortexAgentClient,
)
from snowflake.cortex.agents.turn import AsyncTurn, Turn

large = "é" * 12
boundary_values = ["a", "b", "c", large, "x" * 1000, "d", "e"]
boundary_budget = (
    len(json.dumps({"event": "response.text.delta", "text": "a"}, separators=(",", ":")).encode())
    * 3
)
boundary_snapshots = [["a"], ["a", "b"], ["a", "b", "c"], ["c", large], [], ["d"], ["d", "e"]]


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        self.rfile.read(int(self.headers["Content-Length"]))
        body = "".join(
            f"data: {json.dumps({'event': 'response.text.delta', 'text': text}, ensure_ascii=False, separators=(',', ':'))}\n\n"
            for text in "abcde"
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        events = [{"event": "response.text.delta", "text": "é"} for _ in range(1200)]
        events.append(
            {
                "event": "response",
                "content": [{"type": "text", "text": "final answer"}],
                "metadata": {},
            }
        )
        if "replay-boundary" in self.path:
            events = [{"event": "response.text.delta", "text": text} for text in boundary_values]
        body = "".join(
            f"data: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n"
            for event in events
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    print("backend=local-http")
    with CortexAgentClient(
        base_url=f"http://127.0.0.1:{server.server_port}", auth="example-only"
    ) as client:
        stream = client.agent.stream({"messages": []}, options={"max_replay_events": 2})
        live = list(stream)
        replay = list(stream)
        assert len(live) == 5 and len(replay) == 2
        assert stream.final_text() == "abcde"
        print(f"live events: {len(live)}; retained replay events: {len(replay)}")
        print(f"complete accumulated text: {stream.final_text()}")
        stream.clear_replay()
        assert list(stream) == []
        print(f"replay events after clear: {len(stream.events)}")
        print("Replay limits cap retained event payloads; accumulated output is still retained.")
        boundary_stream = client.runs.resume(
            "replay-boundary", options={"max_replay_bytes": boundary_budget}
        )
        boundary_live = []
        snapshots = []
        for event in boundary_stream:
            boundary_live.append(event["text"])
            snapshots.append([retained["text"] for retained in boundary_stream.events])
        assert boundary_live == boundary_values and snapshots == boundary_snapshots
        assert boundary_stream.final_text() == "".join(boundary_values)
        cases = [
            ({}, 1000),
            ({"max_replay_events": 2}, 2),
            ({"max_replay_events": 0}, 0),
            ({"max_replay_bytes": 1}, 0),
        ]
        for options, expected in cases:
            run = BackgroundRun(client, {"metadata": {"run_id": "42-7"}})
            views = [
                AgentResponseView.from_stream(client.runs.resume("42-7", options=options)),
                client.runs.result("42-7", options=options),
                run.wait(**options),
                Turn(run).result(**options),
            ]
            for view in views:
                assert len(view.events) == expected and view.text == "final answer"

    async def check_async():
        async with AsyncCortexAgentClient(
            base_url=f"http://127.0.0.1:{server.server_port}", auth="example-only"
        ) as client:
            boundary_stream = client.runs.resume(
                "replay-boundary", options={"max_replay_bytes": boundary_budget}
            )
            boundary_live = []
            snapshots = []
            async for event in boundary_stream:
                boundary_live.append(event["text"])
                snapshots.append([retained["text"] for retained in boundary_stream.events])
            assert boundary_live == boundary_values and snapshots == boundary_snapshots
            assert await boundary_stream.final_text() == "".join(boundary_values)
            for options, expected in cases:
                run = AsyncBackgroundRun(client, {"metadata": {"run_id": "42-7"}})
                views = [
                    await AgentResponseView.from_async_stream(
                        client.runs.resume("42-7", options=options)
                    ),
                    await client.runs.result("42-7", options=options),
                    await run.wait(**options),
                    await AsyncTurn(run).result(**options),
                ]
                for view in views:
                    assert len(view.events) == expected and view.text == "final answer"

    asyncio.run(check_async())
    print(
        "byte budget: FIFO evicts 2 oldest; oversized event clears; next 2 retained; all 7 delivered (sync/async)"
    )
    print(
        "result helpers: 1,201 wire events; retained 1,000 / 2 / 0 / 0; final answer preserved (8 surfaces)"
    )
finally:
    server.shutdown()
    server.server_close()
    thread.join()
