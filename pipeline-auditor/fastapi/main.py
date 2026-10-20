"""Pipeline Auditor — a coding agent discovers pipeline objects and reports health issues."""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncGenerator

from cortex_agent_sdk import Conversation, CortexAgentClient
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

app = FastAPI()


class AuditRequest(BaseModel):
    database: str
    message: str | None = None
    # Thread IDs are integers on the wire; accept either form from the browser.
    thread_id: int | str | None = None


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


def _open_conversation(client: CortexAgentClient, thread_id: int | str | None) -> Conversation:
    # attach() resumes from the latest assistant message so follow-ups keep context.
    if thread_id:
        return client.conversations.attach(thread_id)
    return client.conversations.create(origin_application="pipeline-auditor")


def _run_turn(conversation: Conversation, message: str) -> str:
    return conversation.send(message, agent=AGENT_CONFIG).result().text


async def stream_response(request: AuditRequest) -> AsyncGenerator[str, None]:
    client = CortexAgentClient(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        auth=os.environ["SNOWFLAKE_PAT"],
    )
    try:
        conversation = await asyncio.to_thread(_open_conversation, client, request.thread_id)
        yield json.dumps({"type": "thread_id", "thread_id": conversation.id}) + "\n"

        prompt = request.message or AUDIT_PROMPT_TEMPLATE.format(database=request.database)
        text = await asyncio.to_thread(_run_turn, conversation, prompt)
        yield json.dumps({"type": "text", "text": text}) + "\n"
    except Exception as exc:
        yield json.dumps({"type": "text", "text": f"Error: {exc}"}) + "\n"
    finally:
        client.close()
    yield json.dumps({"type": "done"}) + "\n"


@app.post("/audit")
async def audit(request: AuditRequest):
    return StreamingResponse(
        stream_response(request),
        media_type="application/x-ndjson",
    )
