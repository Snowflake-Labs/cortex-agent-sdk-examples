# TypeScript direct Agent API examples

These examples use the lower-level Agent API client from
`@snowflake/cortex-agent-sdk/api`.

Run from the repository root:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/api/stream-agent-run.ts
```

Use `SNOWFLAKE_BASE_URL` instead of `SNOWFLAKE_ACCOUNT` when you need an
explicit endpoint:

```bash
SNOWFLAKE_BASE_URL='https://myaccount.snowflakecomputing.com' \
SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/api/non-streaming.ts
```

## Examples

- `stream-agent-run.ts`: stream an inline agent run.
- `non-streaming.ts`: run an inline agent without streaming.
- `lite-agent-streaming.ts`: use lite agent streaming.
- `coding-agent-run.ts`: run a managed coding agent.
- `coding-agent-permissions.ts`: compare `always_allow` with approval-based
  permission handling.
- `coding-agent-conversation.ts`: use Coding Agent through durable
  conversations.
- `conversation-manual.ts`: manually manage a conversation-like flow with
  threads.
- `threads-crud.ts`: create, update, list, describe, and delete threads.
- `pagination.ts`: iterate paginated thread results.
- `runs.ts`: inspect background runs.
- `abort-and-timeout.ts`: use abort signals and client timeouts.
- `error-handling.ts`: catch typed API errors.
- `send-feedback.ts`: submit run feedback.
- `data-agent-crud.ts`: create, run, update, and delete a data agent.
- `tool-use-analyst.ts`: call an Analyst tool.
- `all-events.ts`: inspect all stream event channels.
- `mcp-servers.ts`: attach Snowflake MCP server objects to agent specs.

Some examples require account-specific objects such as semantic views, search
services, warehouses, or MCP servers. Check the header comment in each file
before running it.
