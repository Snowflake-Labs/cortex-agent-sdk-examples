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

"""An application-specific authentication-header provider."""

import os

from _run_conversation import run_conversation
from snowflake.cortex.agents import CortexAgentClient


class SecretStorePatAuth:
    def get_auth_headers(self) -> dict[str, str]:
        # Replace with a secret-manager lookup. Called before every request attempt.
        token = os.environ["SNOWFLAKE_PAT"]
        return {
            "Authorization": f"Bearer {token}",
            "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
        }


client: CortexAgentClient = CortexAgentClient(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    base_url=os.environ.get("SNOWFLAKE_BASE_URL"),
    auth=SecretStorePatAuth(),
)
run_conversation(client)
client.close()
