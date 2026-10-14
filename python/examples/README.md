# Python examples

Runnable Python examples for the Cortex Agent SDK.

Run commands from the repository root. Most Agent API examples use
`SNOWFLAKE_ACCOUNT` plus `SNOWFLAKE_PAT`:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  python python/examples/non_streaming.py
```

Examples that reuse an existing Snowflake connector session use a local
connection profile:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  python python/examples/auth/session_token.py
```

## Top-level examples

- `stream_agent_run.py`: stream an inline agent run.
- `non_streaming.py`: run an inline agent without streaming.
- `lite_agent_streaming.py`: use lite agent streaming.
- `coding_agent_run.py`: run a managed coding agent.
- `coding_agent_permissions.py`: compare `always_allow` with approval-based
  permission handling.
- `conversation.py`: use the conversation interface.
- `conversation_manual.py`: manually manage a conversation-like flow.
- `conversation_client_content.py`: send client-supplied content.
- `threads_crud.py`: create, update, list, describe, and delete threads.
- `pagination.py`: iterate paginated thread results.
- `runs.py`: inspect background runs.
- `cancel_and_timeout.py`: cancel requests and configure timeouts.
- `error_handling.py`: catch typed API errors.
- `send_feedback.py`: submit run feedback.
- `data_agent_crud.py`: create, run, update, and delete a data agent.
- `tool_use_analyst.py`: call an Analyst tool.
- `all_events.py`: inspect all stream event channels.
- `async_client.py`: use the async client.
- `mcp_servers.py`: attach Snowflake MCP server objects to agent specs.

Subfolders:

- `auth/`: authentication provider examples.
- `cortexcode/`: Cortex Code examples.

Some examples require account-specific objects such as semantic views, search
services, warehouses, or MCP servers. Check the header comment in each file
before running it.
