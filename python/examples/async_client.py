"""The async client end to end.

Every method mirrors the sync client, awaited. Sections:
  1. ``text_stream`` — the shortest way to print an answer as it arrives
  2. callbacks + ``final_text()`` on an ``AsyncAgentRunStream``
  3. concurrent runs with ``asyncio.gather`` — the reason async exists here
  4. ``AsyncThreadsPage`` with ``async for``
  5. ``AsyncConversation`` multi-turn
  6. a background run and ``await run.wait()``
  7. cancellation by cancelling the task
  8. ``with_raw_response`` for headers and retry count

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/async_client.py
"""

from __future__ import annotations

import asyncio
import os
import time

from cortex_agent_sdk import AsyncConversation
from cortex_agent_sdk.api import AsyncCortexAgentClient, StreamEvent

PROMPT = "In one sentence, what is Snowflake?"


def build_client() -> AsyncCortexAgentClient:
    return AsyncCortexAgentClient(
        base_url=f"https://{os.environ['SNOWFLAKE_HOST']}" if os.getenv("SNOWFLAKE_HOST") else None,
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        auth=os.environ["SNOWFLAKE_PAT"],
    )


async def main() -> None:
    async with build_client() as client:
        # --- 1. text_stream ---------------------------------------------------
        print("=== 1. text_stream ===")
        stream = client.agent.stream(
            {"models": {"orchestration": "auto"}, "messages": _user(PROMPT)}
        )
        print("  ", end="", flush=True)
        async for text in stream.text_stream:
            print(text, end="", flush=True)
        print()

        # --- 2. callbacks + final_text ---------------------------------------
        print("\n=== 2. callbacks + final_text ===")
        stream2 = client.agent.stream(
            {"models": {"orchestration": "auto"}, "messages": _user("Name one color.")}
        )
        statuses: list[str] = []
        stream2.on(StreamEvent.STATUS, lambda e: statuses.append(e.get("status") or ""))
        answer = await stream2.final_text()
        print(f"  answer:     {answer.strip()}")
        print(f"  statuses:   {len(statuses)} status event(s)")
        print(f"  request_id: {stream2.request_id}")

        # --- 3. concurrent runs ----------------------------------------------
        # This is the case a sync client cannot serve without a thread each: three
        # independent runs sharing one event loop and one connection pool.
        print("\n=== 3. three concurrent runs vs three sequential ===")
        questions = ["Name a database.", "Name a cloud.", "Name a file format."]

        def ask(question: str) -> object:
            return client.agent.stream(
                {"models": {"orchestration": "auto"}, "messages": _user(question)}
            ).final_text()

        started = time.monotonic()
        answers = await asyncio.gather(*(ask(q) for q in questions))
        concurrent_elapsed = time.monotonic() - started
        for question, reply in zip(questions, answers, strict=True):
            print(f"  {question!r} -> {reply.strip()[:60]}")

        started = time.monotonic()
        for question in questions:
            await ask(question)
        sequential_elapsed = time.monotonic() - started

        print(f"  concurrent: {concurrent_elapsed:.1f}s")
        print(f"  sequential: {sequential_elapsed:.1f}s")
        print(f"  speedup:    {sequential_elapsed / concurrent_elapsed:.1f}x")

        # --- 4. async pagination ---------------------------------------------
        print("\n=== 4. AsyncThreadsPage (async for) ===")
        page = await client.threads.list(page_size=3)
        print(f"  first page: {len(page.data)} thread(s), has_more={page.has_more}")
        seen = 0
        async for _thread in page:
            seen += 1
            if seen >= 5:
                break
        print(f"  auto-paginated over {seen} thread(s)")

        # --- 5. AsyncConversation --------------------------------------------
        print("\n=== 5. AsyncConversation multi-turn ===")
        thread = await client.threads.create(origin_application="sdk-async")
        convo = AsyncConversation(client, thread["thread_id"])
        print(f"  thread {convo.id}")
        first_turn = await convo.send("What is Snowflake Arctic?")
        first = await first_turn.result()
        print(f"  turn 1: {first.text.strip()[:80]}")
        second_turn = await convo.send("In one sentence, name one advantage over Llama 3.")
        second = await second_turn.result()
        print(f"  turn 2: {second.text.strip()[:80]}")
        history = await convo.history()
        print(f"  history: {len(history)} message(s)")

        # --- 6. background run ------------------------------------------------
        print("\n=== 6. background run + await run.wait() ===")
        thread = await client.threads.create(origin_application="sdk-async-bg")
        try:
            run = await client.agent.run(
                {
                    "models": {"orchestration": "auto"},
                    "messages": _user(PROMPT),
                    "thread_id": thread["thread_id"],
                    "parent_message_id": 0,
                    "stream": False,
                    "background": True,
                }
            )
            print(f"  kickoff: status={run.initial_status} run_id={run.run_id}")
            view = await run.wait()
            print(f"  final text: {view.text.strip()[:80]}")
            print(
                f"  events:     {len(view.events) if view.events is not None else '(from thread)'}"
            )
        finally:
            await client.threads.delete(thread["thread_id"])
            print(f"  deleted thread {thread['thread_id']}")

        # --- 7. cancellation --------------------------------------------------
        # No cancel event on the async path: cancel the task and CancelledError
        # propagates out of the iteration, closing the response.
        print("\n=== 7. cancelling a task mid-stream ===")
        long_stream = client.agent.stream(
            {
                "models": {"orchestration": "auto"},
                "messages": _user("Write a 500 word essay about databases."),
            }
        )
        chars = 0
        first_text = asyncio.Event()

        async def drain() -> None:
            nonlocal chars
            async for text in long_stream.text_stream:
                chars += len(text)
                first_text.set()

        task = asyncio.create_task(drain())
        # Wait for the answer to actually start before cancelling, so the count
        # below is a real partial read rather than a race with the first token.
        await first_text.wait()
        await asyncio.sleep(0.5)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            print(f"  cancelled mid-answer after {chars} chars")

        # --- 8. with_raw_response --------------------------------------------
        print("\n=== 8. with_raw_response ===")
        raw = await client.threads.with_raw_response.list(page_size=1)
        print(f"  status:        {raw.status_code}")
        print(f"  request_id:    {raw.request_id}")
        print(f"  retries_taken: {raw.retries_taken}")
        print(f"  threads read:  {len(raw.response_body)}")

        # --- 9. conversation cleanup -----------------------------------------
        await convo.delete()
        print(f"\nDeleted conversation thread {convo.id}")


def _user(text: str) -> list[dict[str, object]]:
    return [{"role": "user", "content": [{"type": "text", "text": text}]}]


if __name__ == "__main__":
    asyncio.run(main())
