# TypeScript examples

TypeScript examples for `@snowflake/cortex-agent-sdk`.

## Setup

Install dependencies from the repository root:

```bash
npm install
```

Run examples from the repository root with `tsx`:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/api/stream-agent-run.ts
```

The TypeScript examples require SDK version `0.0.2` or later.

## Folders

- `examples/`: runnable TypeScript examples.
- `examples_output/`: sanitized representative output from successful runs.

See each subfolder README for the feature area and required environment
variables.
