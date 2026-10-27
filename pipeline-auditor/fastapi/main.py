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

AUDIT_PROMPT_TEMPLATE = """Audit the Snowflake database `{database}` for pipeline health.

1. Discover all pipeline objects: dynamic tables, tasks, streams, and pipes.
2. For each object check its health — look at refresh status, scheduling state,
   error counts, staleness, and any anomalies.
3. Report your findings as a **markdown table** with columns:
   Object Type | Schema | Name | Status | Issue (if any)
4. After the table, summarize the top issues and recommend fixes.

Use SHOW commands and INFORMATION_SCHEMA / ACCOUNT_USAGE views as needed.
Return the complete report directly in your reply; do not write it to a file."""


@app.get("/")
async def index():
    return FileResponse("static/index.html")


def _open_conversation(client: CortexAgentClient, thread_id: int | str | None) -> Conversation:
    # attach() resumes from the latest assistant message so follow-ups keep context.
    if thread_id:
        return client.conversations.attach(thread_id)
    return client.conversations.create(origin_application="pipeline-auditor")


def _run_turn(conversation: Conversation, message: str) -> str:
    answer = conversation.send(message, agent=AGENT_CONFIG).result()
    # `.text` glues the agent's separate text blocks together; keep them apart.
    return "\n\n".join(item.get("text") or "" for item in answer.texts)


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
