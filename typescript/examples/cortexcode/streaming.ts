/**
 * Token-level streaming with `includePartialMessages`.
 *
 * By default the SDK yields one `assistant` event per completed assistant
 * message. Setting `includePartialMessages: true` adds `stream_event` events
 * that carry the raw Anthropic-style streaming envelope, so you can render text
 * as it arrives instead of waiting for the block to close.
 *
 * This example demonstrates:
 *   1. Reassembling text from `content_block_delta` / `text_delta` events
 *   2. Which `stream_event` envelope types actually show up
 *   3. Why tool calls should be tracked from `assistant` messages, not from
 *      partial deltas — tool input arrives as one block, not as `input_json_delta`
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * can exceed the SDK's 60s `initialize` budget; raise it with
 * `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/streaming.ts
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { query } from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-streaming-"));
writeFileSync(join(workdir, "VERSION"), "4.2.1\n");

console.log("=== 1. Streaming a text-only turn ===");

const deltas: string[] = [];
const envelopeTypes: Map<string, number> = new Map();

for await (const event of query({
  prompt: "Reply with exactly this sentence: streaming works end to end.",
  options: {
    cwd: workdir,
    extraArgs: { "no-auto-update": null },
    allowedTools: [],
    onlyExplicitMcpServers: true,
    includePartialMessages: true,
    ...(connection ? { connection } : {}),
  },
})) {
  if (event.type !== "stream_event") continue;
  const envelope = event.event as Record<string, unknown>;
  const envelopeType = String(envelope.type);
  envelopeTypes.set(envelopeType, (envelopeTypes.get(envelopeType) ?? 0) + 1);

  if (envelopeType === "content_block_delta") {
    const delta = envelope.delta as Record<string, unknown>;
    if (delta.type === "text_delta") {
      deltas.push(String(delta.text));
      // In a UI this is where you would append to the rendered buffer.
      process.stdout.write(
        deltas.length === 1 ? `  [text] ${delta.text}` : String(delta.text),
      );
    }
  }
}
if (deltas.length > 0) process.stdout.write("\n");
console.log(`  received ${deltas.length} text_delta chunk(s)`);
console.log(`  reassembled: ${deltas.join("").trim()}`);

console.log("\n=== 2. stream_event envelope types seen ===");
for (const [type, count] of [...envelopeTypes].sort()) {
  console.log(`  ${type}: ${count}`);
}

console.log(
  "\n=== 3. Tool calls come from assistant messages, not partial deltas ===",
);
// `input_json_delta` is the Anthropic envelope for incrementally streamed tool
// input. Cortex Code does not split tool input that way — the complete
// `tool_use` block lands on an `assistant` message. Track tool calls there.
let sawInputJsonDelta: boolean = false;
const toolCalls: string[] = [];

for await (const event of query({
  prompt:
    "Read the VERSION file in the current directory and reply with just the version string.",
  options: {
    cwd: workdir,
    extraArgs: { "no-auto-update": null },
    allowedTools: ["Read"],
    onlyExplicitMcpServers: true,
    includePartialMessages: true,
    ...(connection ? { connection } : {}),
  },
})) {
  if (event.type === "stream_event") {
    const envelope = event.event as Record<string, unknown>;
    if (envelope.type === "content_block_delta") {
      const delta = envelope.delta as Record<string, unknown>;
      if (delta.type === "input_json_delta") sawInputJsonDelta = true;
    }
  } else if (event.type === "assistant") {
    for (const block of event.content) {
      if (block.type === "tool_use") toolCalls.push(block.name);
    }
  }
}
console.log(
  `  tool calls seen on assistant messages: [${toolCalls.join(", ")}]`,
);
console.log(`  any input_json_delta envelopes?        ${sawInputJsonDelta}`);
