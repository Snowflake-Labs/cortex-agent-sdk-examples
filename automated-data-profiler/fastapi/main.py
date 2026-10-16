"""Automated Data Profiler — a coding agent profiles a Snowflake table."""

from __future__ import annotations

import json
import os
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from cortex_agent_sdk import CortexAgentClient

app = FastAPI()


class ProfileRequest(BaseModel):
    table: str
    message: str | None = None
    thread_id: str | None = None


AGENT_CONFIG = {
    "type": "coding",
    "spec": {
        "permission_policy": "always_allow",
        "models": {"orchestration": "claude-sonnet-4-5"},
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

Use SQL queries against the table. Format the full report in clean markdown with tables and code blocks where appropriate.\
"""


@app.get("/")
async def index():
    return FileResponse("static/index.html")


async def stream_response(request: ProfileRequest) -> AsyncGenerator[str, None]:
    client = CortexAgentClient(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        auth=os.environ["SNOWFLAKE_PAT"],
    )
    try:
        if request.thread_id:
            conversation = client.conversations.attach(
                thread_id=request.thread_id,
                agent=AGENT_CONFIG,
            )
        else:
            conversation = client.conversations.create(
                origin_application="data-profiler",
                agent=AGENT_CONFIG,
            )

        yield json.dumps({"type": "thread_id", "thread_id": conversation.id}) + "\n"

        if request.message:
            prompt = request.message
        else:
            prompt = PROFILE_PROMPT.format(table=request.table)

        turn = conversation.send(prompt)
        result = turn.result()

        yield json.dumps({"type": "text", "text": result.text}) + "\n"
        yield json.dumps({"type": "done"}) + "\n"
    finally:
        client.close()


@app.post("/profile")
async def profile(request: ProfileRequest):
    return StreamingResponse(
        stream_response(request),
        media_type="application/x-ndjson",
    )
