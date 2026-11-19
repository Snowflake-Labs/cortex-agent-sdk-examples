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

"""Update temporary saved-agent and CoCo tasks in place, then remove them.

Annual schedules prevent executions during state-preservation checks.
"""

from __future__ import annotations

import os
import uuid

from _automation_example import client_config
from snowflake.cortex.agents import CortexAgentClient
from snowflake.cortex.agents.api import CortexAgentClient as ApiCortexAgentClient


def main() -> None:
    marker = uuid.uuid4().hex[:12]
    schema = {
        "database": os.environ["SNOWFLAKE_DATABASE"],
        "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
    }
    agent = {**schema, "name": f"SDK_UPDATE_AGENT_{marker.upper()}"}
    with (
        CortexAgentClient(**client_config()) as client,
        ApiCortexAgentClient(**client_config()) as api,
    ):
        agent_created = False
        try:
            api.agent.create(
                {"name": agent["name"], "models": {"orchestration": "auto"}}, target=schema
            )
            agent_created = True
            for kind in ("agent", "coding"):
                name = f"Sdk_Update_{kind}_{marker}"
                created = False
                try:
                    print(f"=== Update {kind} automation ===", flush=True)
                    params = (
                        {"agent": agent}
                        if kind == "agent"
                        else {"workspace_stage": None, "disable_email": True}
                    )
                    client.automations.create(
                        name,
                        type=kind,
                        prompt="Reply with UPDATE_OLD",
                        schedule="USING CRON 0 0 1 1 * UTC",
                        **params,
                    )
                    created = True
                    before = next(
                        row for row in client.automations.list().rows if row["name"] == name
                    )
                    response = client.automations.update(
                        name,
                        prompt=f"Reply with UPDATE_NEW_{marker}",
                        display_name=f"SDK update {kind}",
                        schedule="USING CRON 0 0 2 1 * UTC",
                    )
                    after = next(
                        row for row in client.automations.list().rows if row["name"] == name
                    )
                    assert before["id"] == after["id"]
                    assert after["state"].lower() == "suspended"
                    assert after["schedule"] == "USING CRON 0 0 2 1 * UTC"
                    assert after["comment"] == f"SDK update {kind}"
                    definition = client.automations.describe(name).rows[0]["definition"]
                    assert f"UPDATE_NEW_{marker}" in definition
                    assert ("SYSTEM$CORTEX_DATA_AGENT_RUN_V2" in definition) == (kind == "agent")
                    print(f"alter HTTP status: {response.status_code}", flush=True)
                    print(
                        "verified: task ID, suspended state, prompt, schedule and display name",
                        flush=True,
                    )
                    client.automations.resume(name)
                    client.automations.update(name, schedule="USING CRON 0 0 3 1 * UTC")
                    after = next(
                        row for row in client.automations.list().rows if row["name"] == name
                    )
                    assert after["id"] == before["id"] and after["state"].lower() == "started"
                    assert after["schedule"] == "USING CRON 0 0 3 1 * UTC"
                    print("verified: started task resumed after update", flush=True)
                finally:
                    if created:
                        client.automations.delete(name)
                        print("temporary task deleted", flush=True)
        finally:
            if agent_created:
                api.agent.delete(target=agent, if_exists=True)
                print("temporary agent deleted", flush=True)


if __name__ == "__main__":
    main()
