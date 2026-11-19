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

"""Shared lifecycle and persisted-result checks for the live automation examples."""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable
from typing import Any

from snowflake.cortex.agents import AutomationResult, CortexAgentClient
from snowflake.cortex.agents.api import CortexAgentClient as ApiCortexAgentClient
from snowflake.cortex.agents.api import ThreadMessageView


def client_config() -> dict[str, Any]:
    host = os.getenv("SNOWFLAKE_HOST")
    if host:
        label, _, rest = host.partition(".")
        return {
            "base_url": f"https://{label.replace('_', '-')}.{rest}",
            "auth": os.environ["SNOWFLAKE_PAT"],
        }
    return {"account": os.environ["SNOWFLAKE_ACCOUNT"], "auth": os.environ["SNOWFLAKE_PAT"]}


def run_lifecycle(
    client: CortexAgentClient,
    api: ApiCortexAgentClient,
    name: str,
    expected: str,
    create: Callable[[], AutomationResult],
    *,
    require_bash: bool = False,
) -> None:
    created = False
    thread_ids: set[str] = set()

    def task_row() -> dict[str, Any]:
        rows = client.automations.list().rows
        return next(row for row in rows if row["name"] == name)

    try:
        print("=== Create automation ===", flush=True)
        result = create()
        created = True
        print(f"task: {name}\nSQL statement: {result.statement_handle}", flush=True)

        print("\n=== List and describe ===", flush=True)
        row = task_row()
        assert row["state"].lower() == "suspended", row["state"]
        task_id = str(row["id"])
        print(f"state: {row['state']}\nschedule: {row['schedule']}\ntask ID: {task_id}", flush=True)
        assert client.automations.describe(name).rows
        print("describe: returned the task definition", flush=True)

        print("\n=== Resume and suspend ===", flush=True)
        client.automations.resume(name)
        state = task_row()["state"]
        assert state.lower() == "started", state
        print(f"after resume: {state}", flush=True)
        client.automations.suspend(name)
        state = task_row()["state"]
        assert state.lower() == "suspended", state
        print(f"after suspend: {state}", flush=True)

        print("\n=== Execute once and verify persisted response ===", flush=True)
        client.automations.execute(name)
        print("one-off execution submitted", flush=True)
        deadline = time.monotonic() + float(os.getenv("AUTOMATION_WAIT_TIMEOUT", "300"))
        response = None
        response_detail = None
        tools: set[str] = set()
        while time.monotonic() < deadline:
            for thread in api.threads.list(task_id=task_id):
                thread_id = str(thread["thread_id"])
                thread_ids.add(thread_id)
                detail = api.threads.describe(thread_id)
                for message in detail.get("messages", []):
                    view = ThreadMessageView(message)
                    tools.update(item["tool_use"]["name"] for item in view.tool_uses)
                    if view.role == "assistant" and expected in view.text:
                        response = view.text.strip()
                        response_detail = detail
            if response is not None and (not require_bash or any("bash" in tool for tool in tools)):
                print(f"assistant: {response}", flush=True)
                print("full persisted thread response (message_payload decoded):", flush=True)
                readable = {
                    **response_detail,
                    "messages": [
                        {
                            **message,
                            "message_payload": (
                                json.loads(message["message_payload"])
                                if isinstance(message.get("message_payload"), str)
                                else message.get("message_payload")
                            ),
                        }
                        for message in response_detail.get("messages", [])
                    ],
                }
                print(json.dumps(readable, indent=2, ensure_ascii=False), flush=True)
                if require_bash:
                    print(f"sandbox tools invoked: {', '.join(sorted(tools))}", flush=True)
                print("verified: result persisted in an automation-owned thread", flush=True)
                break
            time.sleep(3)
        else:
            raise TimeoutError(
                f"No verified assistant result for task {name}; threads observed: {len(thread_ids)}"
            )
    finally:
        print("\n=== Cleanup ===", flush=True)
        if created:
            client.automations.delete(name)
            assert not any(row["name"] == name for row in client.automations.list().rows)
            print("automation deleted and absent from list", flush=True)
        for thread_id in thread_ids:
            api.threads.delete(thread_id)
        print(f"temporary threads deleted: {len(thread_ids)}", flush=True)
