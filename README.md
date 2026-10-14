# Cortex Agent SDK examples

Runnable examples for the Snowflake Cortex Agent SDKs.

This repository shows how to use the public Cortex Agent SDK packages from a
standalone project:

- TypeScript: `@snowflake/cortex-agent-sdk`
- Python: `snowflake-cortex-agent-sdk`

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

Use `SNOWFLAKE_ACCOUNT` for ordinary account-name based routing:

```bash
export SNOWFLAKE_ACCOUNT=myaccount
export SNOWFLAKE_PAT='...'
```

Use `SNOWFLAKE_BASE_URL` when you need an explicit endpoint, such as a regional,
PrivateLink, or proxy endpoint:

```bash
export SNOWFLAKE_BASE_URL='https://myaccount.snowflakecomputing.com'
export SNOWFLAKE_PAT='...'
```

Examples that demonstrate session-token reuse read a local Snowflake connection
profile:

```bash
export CORTEX_EXAMPLE_CONNECTION=default
```

Do not commit credentials, `.env` files, connection profiles, session tokens, or
private keys to this repository.

## TypeScript setup

Install dependencies:

```bash
npm install
```

Run an Agent API example:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/api/stream-agent-run.ts
```

Run an authentication example:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/auth/pat.ts
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

Create an environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Run an Agent API example:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  python python/examples/stream_agent_run.py
```

Run an authentication example:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  python python/examples/auth/pat.py
```

Run a session-token example from a local Snowflake profile:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  python python/examples/auth/session_token.py
```

Check Python examples:

```bash
ruff check python/examples
python -m compileall -q python/examples
```

## Example groups

### Authentication

Authentication examples live under:

- `typescript/examples/auth/`
- `python/examples/auth/`

They show PAT, OAuth, key-pair JWT, custom auth providers, and Snowflake session
token reuse.

### Conversations

Conversation examples show the higher-level conversation interface for creating
a conversation, sending turns, attaching to existing conversations, and working
with client-supplied content.

### Direct Agent API

Direct API examples live under:

- `typescript/examples/api/`
- `python/examples/`

They demonstrate lower-level Agent API operations such as streaming runs,
non-streaming runs, background runs, threads, pagination, feedback, and error
handling.

### Cortex Code

Cortex Code examples live under:

- `typescript/examples/cortexcode/`
- `python/examples/cortexcode/`

These examples require the `cortex` CLI. Some examples create temporary local
workspaces so the coding agent can read or modify files in an isolated directory.

## Expected output

Expected output captures live under:

- `typescript/examples_output/`
- `python/examples_output/`

The captures are sanitized for public use. Account names, user names, roles,
warehouses, request IDs, and local paths are placeholders or representative
values. Treat them as examples of output shape, not exact output to compare
byte-for-byte against your account.

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
