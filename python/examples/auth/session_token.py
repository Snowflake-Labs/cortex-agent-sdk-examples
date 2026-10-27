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

"""Reuse the session token from a snowflake-connector-python connection."""

import os

import snowflake.connector
from _run_conversation import run_conversation
from cortex_agent_sdk import CortexAgentClient, SnowflakeSessionTokenAuth

connection_name = os.getenv("CORTEX_EXAMPLE_CONNECTION", "default")
connection = snowflake.connector.connect(connection_name=connection_name)
# Account identifiers can contain underscores while URL hostnames use hyphens.
api_host = connection.host.replace("_", "-")


def session_token() -> str:
    rest = connection.rest
    if rest is None or not isinstance(rest.token, str):
        raise RuntimeError("The Snowflake connection did not yield a session token")
    return rest.token


client: CortexAgentClient = CortexAgentClient(
    base_url=os.getenv("CORTEX_EXAMPLE_BASE_URL", f"https://{api_host}"),
    auth=SnowflakeSessionTokenAuth(session_token),
)
try:
    run_conversation(client)
finally:
    client.close()
    connection.close()
