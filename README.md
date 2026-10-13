# Cortex Agent SDK examples

Runnable examples for the Snowflake Cortex Agent SDKs.

This repository is intended to be public. Examples use the published SDK packages rather than imports from the Cortex monorepo:

- TypeScript: `@snowflake/cortex-agent-sdk`
- Python: `snowflake-cortex-agent-sdk`

## Prerequisites

- Node.js 22.22 or later for TypeScript examples.
- Python 3.10 or later for Python examples.
- A Snowflake account where Cortex Agents are enabled.
- Authentication through either:
  - `SNOWFLAKE_ACCOUNT` plus `SNOWFLAKE_PAT`, or
  - an explicit local Snowflake connection profile for examples that demonstrate session-token reuse.

The TypeScript package currently targets `@snowflake/cortex-agent-sdk@^0.0.2`. Regenerate lockfiles after that version is published.

## TypeScript

Install dependencies:

```bash
npm install
```

Run an example:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT=... \
  npx tsx typescript/examples/api/stream-agent-run.ts
```

Examples that reuse an authenticated Snowflake driver session use `CORTEX_EXAMPLE_CONNECTION`.
Set it to one of your own local profile names:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  npx tsx typescript/examples/auth/session-token.ts
```

## Python

Install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Run an example:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT=... \
  python python/examples/stream_agent_run.py
```

Examples that reuse an authenticated Snowflake connector session use `CORTEX_EXAMPLE_CONNECTION`.
Set it to one of your own local profile names:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  python python/examples/auth/session_token.py
```

## Expected output

Expected output captures live under `typescript/examples_output/` and `python/examples_output/`.
They use placeholder request IDs and public-safe account names, and are intended to show the shape of successful runs, not exact byte-for-byte output from your account.
