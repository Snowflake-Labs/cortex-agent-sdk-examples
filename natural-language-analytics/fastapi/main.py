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

"""Natural Language Analytics — FastAPI backend.

Streams Cortex Agent analyst tool results as JSON lines.

Environment variables:
    SNOWFLAKE_ACCOUNT          — Snowflake account identifier
    SNOWFLAKE_PAT              — Personal access token
    SNOWFLAKE_SEMANTIC_VIEW    — Fully-qualified semantic view name
    SNOWFLAKE_WAREHOUSE        — Warehouse for query execution (default: COMPUTE_WH)

Usage:
    uvicorn main:app --reload
"""

import asyncio
import json
import os
import queue
import threading

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from snowflake.cortex.agents.api import CortexAgentClient, StreamEvent

app = FastAPI()

client = CortexAgentClient(
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

SEMANTIC_VIEW = os.environ["SNOWFLAKE_SEMANTIC_VIEW"]
WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")


class QueryRequest(BaseModel):
    question: str


def _to_table(result_set) -> dict | None:
    """Convert a SQL tool ``result_set`` into ``{"columns": [...], "rows": [[...]]}``."""
    if not isinstance(result_set, dict):
        return None
    rows = result_set.get("data") or []
    row_type = (result_set.get("resultSetMetaData") or {}).get("rowType") or []
    if not rows or not row_type:
        return None
    return {"columns": [col.get("name") for col in row_type], "rows": rows}


def _run_stream(question: str, q: queue.Queue):
    """Run the agent stream in a background thread, pushing JSON lines into *q*."""
    try:
        stream = client.agent.stream(
            {
                "models": {"orchestration": "auto"},
                "messages": [
                    {
                        "role": "user",
                        "content": [{"type": "text", "text": question}],
                    }
                ],
                "tools": [
                    {
                        "tool_spec": {
                            "type": "cortex_analyst_text_to_sql",
                            "name": "analyst",
                        }
                    }
                ],
                "tool_resources": {
                    "analyst": {
                        "semantic_view": SEMANTIC_VIEW,
                        "execution_environment": {
                            "type": "warehouse",
                            "warehouse": WAREHOUSE,
                        },
                    }
                },
            }
        )

        def on_status(event):
            q.put(json.dumps({"type": "status", "message": event.get("message", "")}))

        def on_tool_result(event):
            for item in event.get("content") or []:
                if item.get("type") == "json":
                    payload = item.get("json") or {}
                    sql = payload.get("sql")
                    if sql:
                        q.put(json.dumps({"type": "sql", "sql": sql}))
                    table = _to_table(payload.get("result_set"))
                    if table:
                        q.put(json.dumps({"type": "data", "data": table}))

        def on_text(delta, _acc):
            q.put(json.dumps({"type": "text", "text": delta}))

        def on_error(err):
            q.put(json.dumps({"type": "error", "message": str(err)}))

        stream.on(StreamEvent.STATUS, on_status)
        stream.on(StreamEvent.TOOL_RESULT, on_tool_result)
        stream.on(StreamEvent.TEXT, on_text)
        stream.on(StreamEvent.ERROR, on_error)
        stream.done()
    except Exception as exc:
        q.put(json.dumps({"type": "error", "message": str(exc)}))
    finally:
        q.put(None)


async def _event_generator(question: str):
    """Async generator that bridges the blocking SDK stream to ASGI."""
    q = queue.Queue()
    thread = threading.Thread(target=_run_stream, args=(question, q), daemon=True)
    thread.start()

    while True:
        item = await asyncio.to_thread(q.get)
        if item is None:
            break
        yield item + "\n"
    yield json.dumps({"type": "done"}) + "\n"


@app.get("/")
async def index():
    return FileResponse(os.path.join(os.path.dirname(__file__), "static", "index.html"))


@app.post("/query")
async def query(req: QueryRequest):
    return StreamingResponse(
        _event_generator(req.question),
        media_type="application/x-ndjson",
    )
