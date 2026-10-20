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
