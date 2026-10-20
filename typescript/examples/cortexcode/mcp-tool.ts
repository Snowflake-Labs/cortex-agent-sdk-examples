/**
 * In-process MCP tools with `createSdkMcpServer()` + `tool()`.
 *
 * An SDK MCP server needs no transport and no subprocess: the tool handlers are
 * plain async functions in *your* process. The SDK registers the server over the
 * control protocol at initialize time, and the CLI dispatches each call back to
 * the handler. That makes it the shortest path to giving the agent access to
 * your own application state.
 *
 * MCP is CLI mode only; API mode rejects a non-empty `mcpServers` map.
 *
 * This example demonstrates:
 *   1. Defining a server with two tools and inspecting its connected status
 *   2. The agent invoking a tool and using its result
 *   3. `mcpServerStatus()` — the tool inventory the CLI sees
 *   4. Why `toggleMcpServer()` does not apply to SDK servers, and what does
 *
 * Note: `inputSchema` is used to render the tool description, not to validate at
 * call time. Handlers must check their own arguments.
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * can exceed the SDK's 60s `initialize` budget; raise it with
 * `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/mcp-tool.ts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCortexCodeSession,
  createSdkMcpServer,
  tool,
  type CortexCodeEvent,
  type CortexCodeSession,
  type McpServerStatus,
} from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-mcp-tool-"));

async function drainTurn(
  session: CortexCodeSession,
): Promise<CortexCodeEvent[]> {
  const events: CortexCodeEvent[] = [];
  for await (const event of session.stream()) {
    events.push(event);
    if (event.type === "result") break;
  }
  return events;
}

function assistantText(events: CortexCodeEvent[]): string {
  return events
    .filter(
      (e): e is Extract<CortexCodeEvent, { type: "assistant" }> =>
        e.type === "assistant",
    )
    .flatMap((e) => e.content)
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// Handler-local state, to make the point that these tools run in this process.
let inventoryLookups: number = 0;

const inventory: Record<string, number> = { widget: 41, sprocket: 7 };

const server = createSdkMcpServer({
  name: "example-inventory",
  version: "1.0.0",
  tools: [
    // `inputSchema` is only rendered into the tool description — it is not turned
    // into a machine-readable argument spec unless you pass real Zod schemas
    // (`zod` is an optional peer dependency). With a plain placeholder shape the
    // model gets no argument contract and will guess key names, so a tool that
    // must be callable without Zod installed is best defined with no arguments.
    tool(
      "widget_inventory_count",
      "Return the number of widgets currently in stock. Takes no arguments.",
      {},
      async () => {
        inventoryLookups += 1;
        return {
          content: [
            { type: "text", text: `widget: ${inventory.widget} units` },
          ],
        };
      },
    ),
    tool(
      "warehouse_code",
      "Return the code name of the warehouse this inventory lives in. Takes no arguments.",
      {},
      async () => ({
        content: [{ type: "text", text: "warehouse code: HALCYON-3" }],
      }),
    ),
  ],
});

console.log("=== 1. Register the SDK MCP server ===");
const session: CortexCodeSession = await createCortexCodeSession({
  cwd: workdir,
  // Skip the CLI's launch-time auto-update check: in a scripted run it can
  // push startup past the SDK's `initialize` budget, and a pinned CLI is what
  // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
  extraArgs: { "no-auto-update": null },
  // Auto-approve the two MCP tools so the turn does not stop for a prompt. MCP
  // tool names are namespaced `mcp__<server>__<tool>`.
  allowedTools: [
    "mcp__example-inventory__widget_inventory_count",
    "mcp__example-inventory__warehouse_code",
  ],
  // Load only the server passed here, ignoring any ambient mcp.json.
  onlyExplicitMcpServers: true,
  mcpServers: { "example-inventory": server },
  ...(connection ? { connection } : {}),
});

const statuses: McpServerStatus[] = await session.mcpServerStatus();
const own = statuses.find((s) => s.name === "example-inventory");
console.log(`  server:  ${own?.name ?? "(not found)"}`);
console.log(`  status:  ${own?.status ?? "-"}`);
console.log(`  scope:   ${own?.scope ?? "-"}`);
console.log(`  config:  ${JSON.stringify(own?.config)}`);
console.log(
  `  tools:   [${(own?.tools ?? [])
    .map((t) => t.name)
    .sort()
    .join(", ")}]`,
);

console.log("\n=== 2. The agent calls the tool ===");
await session.send(
  "Use the widget_inventory_count tool to look up how many widgets are in stock, " +
    "then reply with just the number.",
);
const events: CortexCodeEvent[] = await drainTurn(session);
const mcpCalls = events
  .filter(
    (e): e is Extract<CortexCodeEvent, { type: "assistant" }> =>
      e.type === "assistant",
  )
  .flatMap((e) => e.content)
  .filter((b) => b.type === "tool_use")
  .map((b) => b.name);
console.log(`  tool_use names:            [${mcpCalls.join(", ")}]`);
console.log(`  handler invocations in this process: ${inventoryLookups}`);
console.log(`  reply: ${assistantText(events)}`);

console.log("\n=== 3. SDK servers cannot be toggled ===");
// `toggleMcpServer` is for transport-backed servers the CLI owns the connection
// to. An SDK server's tools live in this process, so there is nothing to
// disconnect — the CLI refuses rather than silently no-opping. Drop the server
// with `setMcpServers` instead.
try {
  await session.toggleMcpServer("example-inventory", false);
  console.log("  UNEXPECTED: toggle was accepted");
} catch (error) {
  console.log(`  ${error instanceof Error ? error.message : String(error)}`);
}
const afterToggle: McpServerStatus[] = await session.mcpServerStatus();
console.log(
  `  status unchanged: ${afterToggle.find((s) => s.name === "example-inventory")?.status ?? "-"}`,
);

console.log(
  "\n=== 4. setMcpServers({}) clears SDK-managed session servers ===",
);
const cleared = await session.setMcpServers({});
console.log(`  added:   [${cleared.added.join(", ")}]`);
console.log(`  removed: [${cleared.removed.join(", ")}]`);
console.log(`  errors:  ${JSON.stringify(cleared.errors)}`);

await session.close();
console.log("  session closed");
