"""App Builder Agent — users describe a data app, a Cortex Coding Agent generates code."""

from __future__ import annotations

import json
import os
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from cortex_agent_sdk import CortexAgentClient

app = FastAPI()


class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None


AGENT_CONFIG = {
    "type": "coding",
    "spec": {
        "permission_policy": "always_allow",
        "models": {"orchestration": "claude-sonnet-4-5"},
    },
}


@app.get("/")
async def index():
    return FileResponse("static/index.html")


async def stream_response(request: ChatRequest) -> AsyncGenerator[str, None]:
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
                origin_application="app-builder",
                agent=AGENT_CONFIG,
            )

        yield json.dumps({"type": "thread_id", "thread_id": conversation.id}) + "\n"

        turn = conversation.send(request.message)
        result = turn.result()

        yield json.dumps({"type": "text", "text": result.text}) + "\n"
        yield json.dumps({"type": "done"}) + "\n"
    finally:
        client.close()


@app.post("/chat")
async def chat(request: ChatRequest):
    return StreamingResponse(
        stream_response(request),
        media_type="application/x-ndjson",
    )
