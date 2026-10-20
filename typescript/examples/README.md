# TypeScript examples

Runnable TypeScript examples for the Cortex Agent SDK.

Run commands from the repository root. Most Agent API examples use
`SNOWFLAKE_ACCOUNT` plus `SNOWFLAKE_PAT`:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/api/non-streaming.ts
```

Examples that reuse an existing Snowflake driver session use a local connection
profile:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  npx tsx typescript/examples/auth/session-token.ts
```

## Subfolders

- `api/`: direct Agent API examples.
- `auth/`: authentication provider examples.
- `cortexagent/`: higher-level conversation examples.
- `cortexcode/`: Cortex Code CLI/session examples.
- `cortexcode-next-app/`: browser bundling demo.

`_snowflake-session.ts` is a helper used by session-token examples.
