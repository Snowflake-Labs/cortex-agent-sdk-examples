# TypeScript Cortex Code examples

These examples use the Cortex Code TypeScript SDK surfaces. They require the
`cortex` CLI to be installed and authenticated.

Run from the repository root:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  npx tsx typescript/examples/cortexcode/query-basic.ts
```

If the CLI is slow to initialize, increase the initialize timeout:

```bash
CORTEX_CODE_INITIALIZE_TIMEOUT_MS=300000 \
CORTEX_EXAMPLE_CONNECTION=default \
  npx tsx typescript/examples/cortexcode/query-basic.ts
```

## Examples

- `query-basic.ts`: one-shot query over a temporary workspace.
- `streaming.ts`: stream events from a query.
- `session.ts`: keep a long-lived Cortex Code session open for multiple turns.
- `fork-resume.ts`: fork or resume a session.
- `interrupt.ts`: interrupt a running turn.
- `can-use-tool.ts`: implement a programmatic tool permission handler.
- `hooks.ts`: register pre/post tool hooks.
- `mcp-tool.ts`: attach an SDK-defined MCP tool.
- `structured-output.ts`: request structured output.
- `result-and-usage.ts`: inspect terminal results and usage.

Most examples create temporary local workspaces under the system temp directory.
Review each file before running it with a production connection.
