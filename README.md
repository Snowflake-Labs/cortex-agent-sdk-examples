# Cortex Agent SDK Examples

Runnable examples for the [Snowflake Cortex Agent SDKs](https://docs.snowflake.com/en/developer-guide/cortex-agents/overview) in TypeScript and Python.

This repository shows how to use the public Cortex Agent SDK packages from a standalone project:

- **Low-level API** — direct control over agent runs, streaming events, threads, and feedback
- **Conversation API** — higher-level multi-turn conversations with automatic thread management
- **Cortex Code SDK** — programmatic access to the Cortex Code coding agent (CLI queries, sessions, hooks, MCP tools)

The examples cover authentication, conversations, streaming and non-streaming
agent runs, background runs, threads, feedback, request options, error handling,
Cortex Code workflows, and direct Agent API operations.

## Requirements

- A Snowflake account with Cortex Agents enabled.
- Node.js 22.22 or later for TypeScript examples.
- Python 3.10 or later for Python examples.
- Cortex Agent SDK version `0.0.2` or later.
- For Cortex Code examples, the `cortex` CLI must be installed and authenticated.

Some examples create temporary threads, conversations, agents, runs, or local
scratch files. Read each example header before running it so you know which
resources it uses.

## Repository layout

```text
.
├── typescript/
│   ├── examples/          # TypeScript examples
│   └── examples_output/   # Sanitized output captures
├── python/
│   ├── examples/          # Python examples
│   └── examples_output/   # Sanitized output captures
├── natural-language-analytics/   # Use case: NL query dashboard
├── app-builder-agent/            # Use case: AI app builder
├── pipeline-auditor/             # Use case: pipeline health auditor
├── automated-data-profiler/      # Use case: table profiling agent
├── package.json           # TypeScript dependencies and scripts
├── pyproject.toml         # Python dependencies and lint config
└── tsconfig.json
```

The `examples_output` directories show representative output from successful
runs. Request IDs, run IDs, thread IDs, and tool-use IDs are examples only and
will differ in your account.

## Authentication

Most examples use one of these authentication styles:

- `SNOWFLAKE_ACCOUNT` plus `SNOWFLAKE_PAT`
- `SNOWFLAKE_BASE_URL` plus `SNOWFLAKE_PAT`
- a local Snowflake connection profile, selected with `CORTEX_EXAMPLE_CONNECTION`

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

At minimum, set `SNOWFLAKE_ACCOUNT` and `SNOWFLAKE_PAT`. Examples that use analyst or search tools also need `SNOWFLAKE_SEMANTIC_VIEW` and `SNOWFLAKE_SEARCH_SERVICE` — see `.env.example` for all options.

Use `SNOWFLAKE_BASE_URL` when you need an explicit endpoint, such as a regional,
PrivateLink, or proxy endpoint:

```bash
export SNOWFLAKE_BASE_URL='https://myaccount.snowflakecomputing.com'
export SNOWFLAKE_PAT='...'
```

Do not commit credentials, `.env` files, connection profiles, session tokens, or
private keys to this repository.

## TypeScript setup

```bash
npm install
```

Run an example:

```bash
npx tsx typescript/examples/api/stream-agent-run.ts
```

Run a session-token example from a local Snowflake profile:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  npx tsx typescript/examples/auth/session-token.ts
```

Check TypeScript examples:

```bash
npm run check
npm run format:check
```

## Python setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Run an example:

```bash
python python/examples/stream_agent_run.py
```

Check Python examples:

```bash
ruff check python/examples
python -m compileall -q python/examples
```

## Example index

### Low-level API

| Example | Description |
| --- | --- |
| `stream-agent-run` | Stream a lite agent run and handle each event type |
| `all-events` | Create a data agent, run it, and log every event kind |
| `non-streaming` | Non-streaming agent run with `AgentResponseView` |
| `lite-agent-streaming` | Lite agent streaming with the `AgentRunStream` callback API |
| `tool-use-analyst` | Intercept analyst tool use/result events and inspect SQL output |
| `data-agent-crud` | Create, describe, update, and delete a data agent |
| `threads-crud` | Create, list, get, and delete threads |
| `runs` | List and retrieve completed runs within a thread |
| `pagination` | Paginate through threads using cursor-based pagination |
| `send-feedback` | Submit thumbs-up/down feedback on a completed run |
| `error-handling` | Demonstrate API error handling and retry patterns |
| `abort-and-timeout` | Cancel in-flight requests and set timeouts |
| `mcp-servers` | Attach Snowflake MCP SERVER objects to agent runs |
| `coding-agent-run` | Coding agent: streaming, non-streaming, workspace mounts, multi-turn |
| `coding-agent-permissions` | Coding agent permission policies and client-side tool approval |
| `coding-agent-conversation` | Coding agent conversation attach and branch (TypeScript only) |

### Conversation API

| Example | Description |
| --- | --- |
| `conversation` | Multi-agent-type conversation switching |
| `conversation-manual` | Manual thread + run management without the Conversation wrapper |
| `conversation-client-content` | Inject client-side content into the conversation context |

### Authentication

| Example | Description |
| --- | --- |
| `pat` | Programmatic Access Token |
| `oauth` | OAuth access token with refresh hook |
| `session-token` | Reuse an existing Snowflake driver session |
| `key-pair-jwt` | Application-minted key-pair JWT |
| `custom-authenticator` | Custom header provider |

### Cortex Code SDK

| Example | Description |
| --- | --- |
| `query-basic` | Send a one-shot query to Cortex Code (TypeScript) |
| `session` | Create and manage Cortex Code sessions (TypeScript) |
| `streaming` | Stream Cortex Code responses token-by-token (TypeScript) |
| `result-and-usage` | Inspect result metadata and token usage (TypeScript) |
| `hooks` | Register pre/post tool-use hooks (TypeScript) |
| `fork-resume` | Fork a session and resume from a checkpoint (TypeScript) |
| `interrupt` | Interrupt a running Cortex Code turn (TypeScript) |
| `structured-output` | Get structured JSON output from Cortex Code (TypeScript) |
| `can-use-tool` | Check tool availability before invoking (TypeScript) |
| `mcp-tool` | Register and use an MCP tool server (TypeScript) |
| `query-cli` | Run queries through the Cortex Code CLI (Python) |
| `mcp-hooks-fork` | MCP tool with hooks and session forking (Python) |

### Browser demo

The `typescript/examples/cortexcode-next-app/` directory contains a minimal Next.js app that demonstrates the SDK working in a browser environment. See its [README](typescript/examples/cortexcode-next-app/README.md) for setup.

### Async client (Python only)

| Example | Description |
| --- | --- |
| `async-client` | Comprehensive async API surface: concurrent runs, streaming, conversations |

## Use cases

Self-contained mini apps that demonstrate real-world scenarios. Each is available in Next.js, Streamlit, and FastAPI.

| Use case | Description | Directory |
| --- | --- | --- |
| [Natural Language Analytics](natural-language-analytics/) | Ask questions about your data in plain English — get answers, SQL, and tables | `natural-language-analytics/` |
| [App Builder Agent](app-builder-agent/) | Describe the app you want — an AI coding agent builds it | `app-builder-agent/` |
| [Pipeline Auditor](pipeline-auditor/) | Discover and audit Snowflake data pipeline objects for health issues | `pipeline-auditor/` |
| [Automated Data Profiler](automated-data-profiler/) | Point it at a table — get nulls, distributions, outliers, and a quality report | `automated-data-profiler/` |

## Expected output

Expected output captures live under `typescript/examples_output/` and `python/examples_output/`. The captures are sanitized for public use — account names, user names, roles, warehouses, request IDs, and local paths are placeholders. Treat them as examples of output shape, not exact output to compare byte-for-byte against your account.

## Safety notes

- Review each example before running it against a production account.
- Use scoped roles, warehouses, stages, services, and workspaces for testing.
- Be careful with examples that grant tool permissions or run coding-agent
  workflows. Only auto-approve tool use when your application intentionally
  trusts the input and the workspace access is scoped appropriately.
- Delete temporary Snowflake resources created by examples when you are done.

## Troubleshooting

If an example cannot import `@snowflake/cortex-agent-sdk/api`, verify that your
installed TypeScript SDK is version `0.0.2` or later.

If an example fails with authentication errors, verify that:

- `SNOWFLAKE_ACCOUNT` or `SNOWFLAKE_BASE_URL` points to the intended account.
- `SNOWFLAKE_PAT` is valid for that account.
- The active role has access to Cortex Agents and any referenced tools,
  warehouses, semantic views, search services, stages, or agent objects.

If a session-token example fails, verify that the named Snowflake connection
profile exists and can connect outside the SDK example.

## Contributing

Keep examples runnable from the repository root. When adding an example:

- Add both TypeScript and Python versions when the feature exists in both SDKs.
- Add or update sanitized output under the matching `examples_output` directory.
- Avoid hardcoded internal accounts, users, hosts, roles, warehouses, local
  paths, or credentials.
- Prefer environment variables for account-specific objects.
- Run formatting, type checks, and Python lint/syntax checks before publishing.

## License

Apache License 2.0. See [LICENSE](LICENSE).
