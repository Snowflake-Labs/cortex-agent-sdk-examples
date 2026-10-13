"""Managed coding-agent permission policies.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/coding_agent_permissions.py
    CORTEX_EXAMPLE_CONNECTION=default python examples/coding_agent_permissions.py

For regional, PrivateLink, custom, or proxy endpoints, set
SNOWFLAKE_BASE_URL instead of SNOWFLAKE_ACCOUNT.

``always_allow`` auto-approves tool operations that would otherwise require
approval. Use it only with trusted inputs and scoped workspace/access.
``always_ask`` lets an application surface the tool request and send a
``permission_decision`` in a follow-up request after approval.
"""

from __future__ import annotations

import os

import snowflake.connector
from cortex_agent_sdk import SnowflakeSessionTokenAuth
from cortex_agent_sdk.api import AgentEvent, CortexAgentClient


def permission_options(event: AgentEvent) -> list[str]:
    permission = event.get("permission")
    if not isinstance(permission, dict):
        return []
    options = permission.get("options")
    if not isinstance(options, list):
        return []
    return [option for option in options if isinstance(option, str)]


def tool_use_id(event: AgentEvent) -> str:
    value = event.get("tool_use_id")
    if not isinstance(value, str) or not value:
        raise RuntimeError("Permission event did not include tool_use_id")
    return value


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

prompt = (
    "Run this exact bash command and report the stdout: "
    "rm -rf /tmp/cortex-agent-sdk-permission-example-does-not-exist && echo permission-example-ok"
)

try:
    allow_stream = client.coding_agent.stream(
        {
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            "permission_policy": "always_allow",
            "models": {"orchestration": "claude-sonnet-4-5"},
        }
    )
    allow_stream.until_done()

    allow_saw_permission = any(
        event.get("event") == "response.tool_use" and "permission" in event
        for event in allow_stream.events
    )
    allow_saw_client_tool_use_request = any(
        event.get("event") == "response.status"
        and event.get("status") == "client_tool_use_request"
        for event in allow_stream.events
    )

    print("always_allow result")
    print(f"  text: {allow_stream.current_text.strip()}")
    print(f"  request_id: {allow_stream.request_id}")
    print(f"  emitted tool permission: {allow_saw_permission}")
    print(f"  emitted client_tool_use_request status: {allow_saw_client_tool_use_request}")

    thread = client.threads.create()
    thread_id = str(thread["thread_id"])
    ask_run = client.coding_agent.run(
        {
            "thread_id": thread_id,
            "parent_message_id": 0,
            "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}],
            "permission_policy": "always_ask",
            "models": {"orchestration": "claude-sonnet-4-5"},
            "stream": False,
            "background": True,
        }
    )

    permission_event: AgentEvent | None = None
    ask_saw_client_tool_use_request = False
    for event in client.runs.stream(ask_run.run_id):
        if event.get("event") == "response.tool_use" and "permission" in event:
            permission_event = event
        if (
            event.get("event") == "response.status"
            and event.get("status") == "client_tool_use_request"
        ):
            ask_saw_client_tool_use_request = True
    ask_response = ask_run.wait()

    print("always_ask result")
    print(f"  first_request_id: {ask_run.request_id}")
    print(f"  emitted tool permission: {permission_event is not None}")
    print(f"  emitted client_tool_use_request status: {ask_saw_client_tool_use_request}")

    if permission_event is None:
        raise RuntimeError("Expected always_ask to emit a permission request")
    decision = "Allow this command"
    options = permission_options(permission_event)
    if decision not in options:
        raise RuntimeError(f"Expected permission options to include {decision!r}")
    if ask_response.message_id is None:
        raise RuntimeError("Permission response did not include an assistant message id")

    print(f"  permission options: {options}")
    print(f"  selected decision: {decision}")

    follow_up_run = client.coding_agent.run(
        {
            "thread_id": thread_id,
            "parent_message_id": ask_response.message_id,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "permission_decision",
                            "permission_decision": {
                                "tool_use_id": tool_use_id(permission_event),
                                "decision": decision,
                            },
                        }
                    ],
                }
            ],
            "permission_policy": "always_ask",
            "models": {"orchestration": "claude-sonnet-4-5"},
            "stream": False,
            "background": True,
        }
    )
    follow_up_response = follow_up_run.wait()
    print(f"  follow_up_request_id: {follow_up_run.request_id}")
    print(f"  continued text: {follow_up_response.text.strip()}")
finally:
    client.close()
    if connection is not None:
        connection.close()
