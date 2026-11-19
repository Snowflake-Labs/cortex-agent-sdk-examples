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

"""Create a saved-agent automation, run it once, verify its reply, and clean up.

Run after loading SNOWFLAKE_HOST/SNOWFLAKE_PAT from your connection profile.
The annual schedule avoids background runs while testing resume/suspend.
"""

from __future__ import annotations

import os
import uuid

from _automation_example import client_config, run_lifecycle
from snowflake.cortex.agents import CortexAgentClient
from snowflake.cortex.agents.api import CortexAgentClient as ApiCortexAgentClient


def main() -> None:
    marker = uuid.uuid4().hex[:12].upper()
    name = f"SDK_AGENT_AUTOMATION_PY_{marker}"
    expected = f"SDK_AGENT_AUTOMATION_OK_{marker}"
    schema = {
        "database": os.environ["SNOWFLAKE_DATABASE"],
        "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
    }
    agent = {**schema, "name": f"SDK_AUTOMATION_AGENT_PY_{marker}"}
    agent_created = False
    with (
        CortexAgentClient(**client_config()) as client,
        ApiCortexAgentClient(**client_config()) as api,
    ):
        try:
            print("=== Create temporary saved agent ===", flush=True)
            api.agent.create(
                {
                    "name": agent["name"],
                    "models": {"orchestration": "auto"},
                    "instructions": {
                        "response": "Follow the user's requested response format exactly."
                    },
                },
                target=schema,
                create_mode="errorIfExists",
            )
            agent_created = True
            print(f"saved agent: {agent['database']}.{agent['schema']}.{agent['name']}", flush=True)
            run_lifecycle(
                client,
                api,
                name,
                expected,
                lambda: client.automations.create(
                    name,
                    agent=agent,
                    prompt=f"Reply with exactly {expected}. Do not invoke any tools.",
                    schedule="USING CRON 0 0 1 1 * UTC",
                ),
            )
        finally:
            if agent_created:
                api.agent.delete(target=agent, if_exists=True)
                print("temporary saved agent deleted", flush=True)


if __name__ == "__main__":
    main()
