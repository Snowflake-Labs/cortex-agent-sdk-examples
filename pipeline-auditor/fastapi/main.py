"""Pipeline Auditor — a coding agent discovers pipeline objects and reports health issues."""

from __future__ import annotations

import json
import os
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from cortex_agent_sdk import CortexAgentClient

app = FastAPI()


class AuditRequest(BaseModel):
    database: str
    message: str | None = None
    thread_id: str | None = None


AGENT_CONFIG = {
    "type": "coding",
    "spec": {
        "permission_policy": "always_allow",
        "models": {"orchestration": "claude-sonnet-4-5"},
    },
}

AUDIT_PROMPT_TEMPLATE = """Audit the Snowflake database `{database}` for pipeline health.

1. Discover all pipeline objects: dynamic tables, tasks, streams, and pipes.
2. For each object check its health — look at refresh status, scheduling state,
   error counts, staleness, and any anomalies.
3. Report your findings as a **markdown table** with columns:
   Object Type | Schema | Name | Status | Issue (if any)
4. After the table, summarize the top issues and recommend fixes.

Use SHOW commands and INFORMATION_SCHEMA / ACCOUNT_USAGE views as needed."""


@app.get("/")
async def index():
    return FileResponse("static/index.html")


async def stream_response(request: AuditRequest) -> AsyncGenerator[str, None]:
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
                origin_application="pipeline-auditor",
                agent=AGENT_CONFIG,
            )

        yield json.dumps({"type": "thread_id", "thread_id": conversation.id}) + "\n"

        if request.message:
            prompt = request.message
        else:
            prompt = AUDIT_PROMPT_TEMPLATE.format(database=request.database)

        turn = conversation.send(prompt)
        result = turn.result()

        yield json.dumps({"type": "text", "text": result.text}) + "\n"
        yield json.dumps({"type": "done"}) + "\n"
    finally:
        client.close()


@app.post("/audit")
async def audit(request: AuditRequest):
    return StreamingResponse(
        stream_response(request),
        media_type="application/x-ndjson",
    )
