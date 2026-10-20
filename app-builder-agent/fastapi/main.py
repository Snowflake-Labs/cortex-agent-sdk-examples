"""App Builder Agent — users describe a data app, a Cortex Coding Agent generates code."""

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


class ChatRequest(BaseModel):
    message: str
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


@app.get("/")
async def index():
    return FileResponse("static/index.html")


def _open_conversation(client: CortexAgentClient, thread_id: int | str | None) -> Conversation:
    # attach() resumes from the latest assistant message so follow-ups keep context.
    if thread_id:
        return client.conversations.attach(thread_id)
    return client.conversations.create(origin_application="app-builder")


def _run_turn(conversation: Conversation, message: str) -> str:
    answer = conversation.send(message, agent=AGENT_CONFIG).result()
    # `.text` glues the agent's separate text blocks together; keep them apart.
    return "\n\n".join(item.get("text") or "" for item in answer.texts)


async def stream_response(request: ChatRequest) -> AsyncGenerator[str, None]:
    client = CortexAgentClient(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        auth=os.environ["SNOWFLAKE_PAT"],
    )
    try:
        conversation = await asyncio.to_thread(_open_conversation, client, request.thread_id)
        yield json.dumps({"type": "thread_id", "thread_id": conversation.id}) + "\n"

        text = await asyncio.to_thread(_run_turn, conversation, request.message)
        yield json.dumps({"type": "text", "text": text}) + "\n"
    except Exception as exc:
        yield json.dumps({"type": "text", "text": f"Error: {exc}"}) + "\n"
    finally:
        client.close()
    yield json.dumps({"type": "done"}) + "\n"


@app.post("/chat")
async def chat(request: ChatRequest):
    return StreamingResponse(
        stream_response(request),
        media_type="application/x-ndjson",
    )
