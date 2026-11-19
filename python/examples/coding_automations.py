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

"""Run an isolated CoCo automation once, verify its bash call and reply, and clean up."""

from __future__ import annotations

import uuid

from _automation_example import client_config, run_lifecycle
from snowflake.cortex.agents import CortexAgentClient
from snowflake.cortex.agents.api import CortexAgentClient as ApiCortexAgentClient


def main() -> None:
    marker = uuid.uuid4().hex[:12].upper()
    name = f"SDK_COCO_AUTOMATION_PY_{marker}"
    expected = f"SDK_COCO_AUTOMATION_OK_{marker}"
    prompt = (
        f"E2E_CASE=public-agent-sdk-python-coding-automation-{marker}. "
        f"Use the bash tool to run printf '%s\\n' '{expected}', then reply with exactly {expected}. "
        "Do not read or modify workspace files, repositories, or Snowflake data."
    )
    with (
        CortexAgentClient(**client_config()) as client,
        ApiCortexAgentClient(**client_config()) as api,
    ):
        print("CoCo workspace: no mount (isolated sandbox); report email disabled", flush=True)
        run_lifecycle(
            client,
            api,
            name,
            expected,
            lambda: client.automations.create(
                name,
                type="coding",
                prompt=prompt,
                schedule="USING CRON 0 0 1 1 * UTC",
                model="auto",
                workspace_stage=None,
                disable_email=True,
            ),
            require_bash=True,
        )


if __name__ == "__main__":
    main()
