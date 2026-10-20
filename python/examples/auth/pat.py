"""Programmatic Access Token authentication."""

import os

from _run_conversation import run_conversation
from cortex_agent_sdk import CortexAgentClient, PatAuth

client: CortexAgentClient = CortexAgentClient(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    base_url=os.environ.get("SNOWFLAKE_BASE_URL"),
    auth=PatAuth(os.environ["SNOWFLAKE_PAT"]),
)
run_conversation(client)
client.close()
