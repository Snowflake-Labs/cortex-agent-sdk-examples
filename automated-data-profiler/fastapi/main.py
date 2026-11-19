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

"""Automated Data Profiler — a coding agent profiles a Snowflake table."""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from snowflake.cortex.agents import Conversation, CortexAgentClient

app = FastAPI()


class ProfileRequest(BaseModel):
    table: str
    message: str | None = None
    # Thread IDs are integers on the wire; accept either form from the browser.
    thread_id: int | str | None = None


AGENT_CONFIG = {
    "type": "coding",
    "spec": {
        "permission_policy": "always_allow",
        "models": {"orchestration": "claude-sonnet-4-5"},
        # Without this the agent sometimes writes code/reports to sandbox files
        # and replies with no text, leaving the user with an empty answer.
        "instructions": {
            "system": (
                "Put your complete answer, including any code or report, directly in "
                "your reply. Do not write files unless the user explicitly asks for one."
            )
        },
    },
}

PROFILE_PROMPT = """\
Profile the Snowflake table **{table}** and produce a comprehensive markdown report.

Cover these sections:

1. **Schema Overview** — column names, data types, and nullable flags in a markdown table.
2. **Row Count & Freshness** — total rows and when data was last updated (MAX of any timestamp/date column, or metadata if available).
3. **Null Analysis** — for every column, count and percentage of NULLs. Flag columns above 10%.
4. **Unique Values** — distinct counts per column and whether each could be a primary key.
5. **Numeric Distributions** — for numeric columns: min, max, mean, median, stddev.
6. **Categorical Distributions** — for low-cardinality string columns (< 50 distinct): top 10 values with counts.
7. **Outlier Detection** — flag numeric values beyond 3 standard deviations.
8. **Data Quality Summary** — overall quality score and key findings.

Use SQL queries against the table. Format the full report in clean markdown with tables and code blocks where appropriate. Return the complete report directly in your reply; do not write it to a file.\
"""


@app.get("/")
async def index():
    return FileResponse("static/index.html")


def _open_conversation(client: CortexAgentClient, thread_id: int | str | None) -> Conversation:
    # attach() resumes from the latest assistant message so follow-ups keep context.
    if thread_id:
        return client.conversations.attach(thread_id)
    return client.conversations.create(origin_application="data-profiler")


def _run_turn(conversation: Conversation, message: str) -> str:
    answer = conversation.send(message, agent=AGENT_CONFIG).result()
    # `.text` glues the agent's separate text blocks together; keep them apart.
    return "\n\n".join(item.get("text") or "" for item in answer.texts)


async def stream_response(request: ProfileRequest) -> AsyncGenerator[str, None]:
    client = CortexAgentClient(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        auth=os.environ["SNOWFLAKE_PAT"],
    )
    try:
        conversation = await asyncio.to_thread(_open_conversation, client, request.thread_id)
        yield json.dumps({"type": "thread_id", "thread_id": conversation.id}) + "\n"

        prompt = request.message or PROFILE_PROMPT.format(table=request.table)
        text = await asyncio.to_thread(_run_turn, conversation, prompt)
        yield json.dumps({"type": "text", "text": text}) + "\n"
    except Exception as exc:
        yield json.dumps({"type": "text", "text": f"Error: {exc}"}) + "\n"
    finally:
        client.close()
    yield json.dumps({"type": "done"}) + "\n"


@app.post("/profile")
async def profile(request: ProfileRequest):
    return StreamingResponse(
        stream_response(request),
        media_type="application/x-ndjson",
    )
