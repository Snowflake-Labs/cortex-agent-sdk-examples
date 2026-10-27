// Copyright 2026 Snowflake Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * `query()` — the one-shot entry point for Cortex Code.
 *
 * `query()` returns a `Query`, which is an `AsyncGenerator<CortexCodeEvent>`
 * plus a set of control methods. The underlying `cortex` CLI process is spawned
 * lazily on the first `next()`, and the generator stops after the single
 * terminal `result` event — so a plain `for await` loop is the whole lifecycle.
 *
 * This example demonstrates:
 *   1. Draining the event stream and tallying each event type
 *   2. Reading `tool_use` blocks off `assistant` messages
 *   3. Reading the terminal `result` event
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * can exceed the SDK's 60s `initialize` budget; raise it with
 * `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/query-basic.ts
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  query,
  type CortexCodeEvent,
  type Query,
} from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

// A scratch workspace so the agent has a real file to read and nothing else.
const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-query-basic-"));
writeFileSync(
  join(workdir, "greeting.txt"),
  "hello from the cortex code sdk\n",
);

console.log("=== 1. query() over a scratch workspace ===");
console.log(`  cwd:        ${workdir}`);
console.log(`  connection: ${connection ?? "(CLI default)"}`);

const q: Query = query({
  prompt:
    "Read greeting.txt in the current directory and reply with its contents " +
    "verbatim on a single line. Do not add commentary.",
  options: {
    cwd: workdir,
    // Skip the CLI's launch-time auto-update check: in a scripted run it can
    // push startup past the SDK's `initialize` budget, and a pinned CLI is what
    // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
    extraArgs: { "no-auto-update": null },
    // Auto-approve Read so the CLI never needs an interactive prompt. Without
    // an allowlist (or a `canUseTool` handler) a tool call would block waiting
    // for a decision that a headless process can never give.
    allowedTools: ["Read"],
    ...(connection ? { connection } : {}),
  },
});

const eventCounts: Map<string, number> = new Map();
const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
const assistantText: string[] = [];
let terminal: CortexCodeEvent | undefined;

for await (const event of q) {
  eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1);

  if (event.type === "assistant") {
    for (const block of event.content) {
      if (block.type === "text") assistantText.push(block.text);
      if (block.type === "tool_use")
        toolCalls.push({ name: block.name, input: block.input });
    }
  }
  // The generator stops after this event, so capture it in the loop rather than
  // trying to read it afterwards.
  if (event.type === "result") terminal = event;
}

console.log("\n=== 2. Event tally ===");
for (const [type, count] of [...eventCounts].sort()) {
  console.log(`  ${type}: ${count}`);
}

console.log("\n=== 3. Tool calls the agent made ===");
if (toolCalls.length === 0) console.log("  (none)");
for (const call of toolCalls) {
  console.log(`  ${call.name} ${JSON.stringify(call.input)}`);
}

console.log("\n=== 4. Assistant text ===");
console.log(`  ${assistantText.join("").trim()}`);

console.log("\n=== 5. Terminal result event ===");
if (terminal?.type === "result") {
  console.log(`  subtype:   ${terminal.subtype}`);
  console.log(`  is_error:  ${terminal.is_error}`);
  console.log(`  num_turns: ${terminal.num_turns}`);
  console.log(
    `  result:    ${terminal.is_error ? terminal.errors.join("; ") : terminal.result}`,
  );
} else {
  console.log("  (stream ended without a result event)");
}
