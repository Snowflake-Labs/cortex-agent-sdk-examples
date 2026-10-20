"""Attach Snowflake MCP SERVER objects to lite agent:run and data-agent specs.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/mcp_servers.py
    CORTEX_EXAMPLE_CONNECTION=default python examples/mcp_servers.py

For regional, PrivateLink, custom, or proxy endpoints, set
SNOWFLAKE_BASE_URL instead of SNOWFLAKE_ACCOUNT.

Uses a SQL MCP SERVER with SYSTEM_EXECUTE_SQL (no OAuth). Override with
SNOWFLAKE_MCP_SERVER (FQN). Creates
CORTEX_AGENT_SDK_EXAMPLES.PUBLIC.SDK_SQL_EXEC_MCP when a SQL connection is
available (profile path).
"""

from __future__ import annotations

import os
import re

import snowflake.connector
from cortex_agent_sdk import SnowflakeSessionTokenAuth
from cortex_agent_sdk.api import AgentEvent, CortexAgentClient

MCP_SERVER_FQN = os.getenv(
    "SNOWFLAKE_MCP_SERVER", "CORTEX_AGENT_SDK_EXAMPLES.PUBLIC.SDK_SQL_EXEC_MCP"
)
AGENT_DB = os.getenv("SNOWFLAKE_DATABASE", "CORTEX_AGENT_SDK_EXAMPLES")
AGENT_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")
AGENT_NAME = f"SDK_MCP_EXAMPLE_AGENT_{os.getpid()}"


def collect_text(events: list[AgentEvent]) -> str:
    return "".join(
        str(event.get("text", "")) for event in events if event.get("event") == "response.text"
    )


def tool_names(events: list[AgentEvent]) -> list[str]:
    names: list[str] = []
    for event in events:
        if event.get("event") != "response.tool_use":
            continue
        name = event.get("name")
        if isinstance(name, str):
            names.append(name)
    return names


connection = None
if os.getenv("SNOWFLAKE_PAT"):
    client = CortexAgentClient(
        base_url=os.getenv("SNOWFLAKE_BASE_URL"),
        account=None if os.getenv("SNOWFLAKE_BASE_URL") else os.environ["SNOWFLAKE_ACCOUNT"],
        auth=os.environ["SNOWFLAKE_PAT"],
    )
else:
    connection_name = os.getenv("CORTEX_EXAMPLE_CONNECTION", "default")
    connection = snowflake.connector.connect(connection_name=connection_name)
    api_host = connection.host.replace("_", "-")

    def session_token() -> str:
        rest = connection.rest if connection is not None else None
        if rest is None or not isinstance(rest.token, str):
            raise RuntimeError("The Snowflake connection did not yield a session token")
        return rest.token

    client = CortexAgentClient(
        base_url=os.getenv("CORTEX_EXAMPLE_BASE_URL", f"https://{api_host}"),
        auth=SnowflakeSessionTokenAuth(session_token),
    )

try:
    if connection is not None:
        cur = connection.cursor()
        cur.execute("CREATE DATABASE IF NOT EXISTS CORTEX_AGENT_SDK_EXAMPLES")
        cur.execute("CREATE SCHEMA IF NOT EXISTS CORTEX_AGENT_SDK_EXAMPLES.PUBLIC")
        cur.execute(
            """
CREATE OR REPLACE MCP SERVER CORTEX_AGENT_SDK_EXAMPLES.PUBLIC.SDK_SQL_EXEC_MCP
FROM SPECIFICATION $$
tools:
  - name: sql_exec_tool
    title: SQL Execution Tool
    description: Execute a single SQL query and return results.
    type: SYSTEM_EXECUTE_SQL
$$
"""
        )

    print("lite_agent_run_with_mcp_servers")
    print(f"  mcp_server: {MCP_SERVER_FQN}")

    lite_stream = client.agent.stream(
        {
            "models": {"orchestration": "claude-sonnet-4-5"},
            "instructions": {
                "orchestration": (
                    "Use the MCP SQL tool to answer. Prefer "
                    "SELECT CURRENT_USER() AS u, CURRENT_ROLE() AS r."
                ),
                "response": "Be concise. Quote the SQL result.",
            },
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Using the attached MCP SQL tool, run "
                                "SELECT CURRENT_USER() AS u, CURRENT_ROLE() AS r "
                                "and report the result."
                            ),
                        }
                    ],
                }
            ],
            "mcp_servers": [{"server_spec": {"name": MCP_SERVER_FQN}}],
        }
    )
    lite_stream.until_done()
    lite_tools = tool_names(list(lite_stream.events))
    print(f"  request_id: {lite_stream.request_id}")
    print(f"  tool_uses: {lite_tools}")
    print(f"  used_mcp_tool: {any(re.search(r'sql|mcp', n, re.I) for n in lite_tools)}")
    print(f"  text: {collect_text(list(lite_stream.events)).strip()[:500]}")

    print("data_agent_create_with_mcp_servers")
    print(f"  agent: {AGENT_DB}.{AGENT_SCHEMA}.{AGENT_NAME}")
    client.agent.create(
        {
            "name": AGENT_NAME,
            "models": {"orchestration": "claude-sonnet-4-5"},
            "instructions": {
                "orchestration": "Use the MCP SQL tool when the user asks for the current user/role.",
                "response": "Be concise.",
            },
            "mcp_servers": [{"server_spec": {"name": MCP_SERVER_FQN}}],
        },
        target={"database": AGENT_DB, "schema": AGENT_SCHEMA},
        create_mode="orReplace",
    )

    data_stream = client.agent.stream_data(
        {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Using your MCP SQL tool, run SELECT CURRENT_USER() AS u "
                                "and report the value."
                            ),
                        }
                    ],
                }
            ]
        },
        target={"database": AGENT_DB, "schema": AGENT_SCHEMA, "name": AGENT_NAME},
    )
    data_stream.until_done()
    data_tools = tool_names(list(data_stream.events))
    print(f"  request_id: {data_stream.request_id}")
    print(f"  tool_uses: {data_tools}")
    print(f"  used_mcp_tool: {any(re.search(r'sql|mcp', n, re.I) for n in data_tools)}")
    print(f"  text: {collect_text(list(data_stream.events)).strip()[:500]}")

    client.agent.delete(
        target={"database": AGENT_DB, "schema": AGENT_SCHEMA, "name": AGENT_NAME},
        if_exists=True,
    )
    print("cleanup")
    print(f"  deleted_agent: {AGENT_DB}.{AGENT_SCHEMA}.{AGENT_NAME}")
finally:
    client.close()
    if connection is not None:
        connection.close()
