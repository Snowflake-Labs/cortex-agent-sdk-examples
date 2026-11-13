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

"""Key-pair JWT authentication; the application owns signing and renewal."""

import os

from _run_conversation import run_conversation
from snowflake.cortex.agents import CortexAgentClient, KeyPairJwtAuth


def mint_jwt() -> str:
    # Sign a short-lived JWT with your protected private key. The SDK does not sign it.
    return os.environ["SNOWFLAKE_KEYPAIR_JWT"]


client: CortexAgentClient = CortexAgentClient(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    base_url=os.environ.get("SNOWFLAKE_BASE_URL"),
    auth=KeyPairJwtAuth(mint_jwt),
    refresh_auth=lambda _context: None,
)
run_conversation(client)
client.close()
