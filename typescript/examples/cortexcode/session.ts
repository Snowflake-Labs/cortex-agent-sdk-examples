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
 * `createCortexCodeSession()` — a long-lived Cortex Code process you can send
 * many turns to.
 *
 * Where `query()` is one prompt in / one `result` out, a session keeps the CLI
 * process alive: `send()` queues a user turn, `stream()` yields events until the
 * `result` for that turn, and the transcript carries over to the next `send()`.
 *
 * This example demonstrates:
 *   1. Creating a session and reading the `initialize` handshake
 *   2. The `system`/`init` event, which carries the session's live configuration
 *   3. Turn 1, drained to its `result`
 *   4. Turn 2 answering from turn 1's context
 *   5. `setModel()` mid-session
 *   6. Closing the session (also available via `await using`)
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * can exceed the SDK's 60s `initialize` budget; raise it with
 * `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/session.ts
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCortexCodeSession,
  type CortexCodeEvent,
  type CortexCodeSession,
  type QueryInitializationResult,
} from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-session-"));
writeFileSync(join(workdir, "codeword.txt"), "PERIWINKLE\n");

/** Drain one turn: events up to and including that turn's `result`. */
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

console.log("=== 1. Create a session ===");
const session: CortexCodeSession = await createCortexCodeSession({
  cwd: workdir,
  // Skip the CLI's launch-time auto-update check: in a scripted run it can
  // push startup past the SDK's `initialize` budget, and a pinned CLI is what
  // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
  extraArgs: { "no-auto-update": null },
  allowedTools: ["Read"],
  // Keep the session hermetic: load only MCP servers this call passes (none),
  // so an ambient developer mcp.json can't change what the agent can reach.
  onlyExplicitMcpServers: true,
  ...(connection ? { connection } : {}),
});
console.log(`  cwd: ${workdir}`);
console.log(`  CLI process live: ${session.pid !== undefined}`);

// The `initialize` control response is metadata the CLI advertises up front.
// Which keys it populates depends on the CLI version, so treat every field as
// optional rather than assuming a shape.
const init: QueryInitializationResult = await session.initializationResult();
console.log(`  initialize keys: [${Object.keys(init).sort().join(", ")}]`);
console.log(`  slash commands advertised: ${init.commands?.length ?? 0}`);

console.log("\n=== 2. Turn 1 ===");
await session.send(
  "Read codeword.txt and reply with the single word it contains.",
);
const turn1: CortexCodeEvent[] = await drainTurn(session);
console.log(`  reply: ${assistantText(turn1)}`);
const turn1Result = turn1.find((e) => e.type === "result");
console.log(
  `  result subtype: ${turn1Result?.type === "result" ? turn1Result.subtype : "-"}`,
);

console.log("\n=== 3. The system/init event ===");
// Emitted once at the start of the first turn's stream. It reports the
// configuration the CLI actually resolved, which is the authoritative answer to
// "what model / permission mode / tools is this session really using?".
const initEvent = turn1.find(
  (e) => e.type === "system" && e.subtype === "init",
);
if (initEvent?.type === "system") {
  const details = initEvent as unknown as {
    model: string;
    permissionMode: string;
    apiKeySource: string;
    cwd: string;
    tools: string[];
  };
  console.log(`  model:          ${details.model}`);
  console.log(`  permissionMode: ${details.permissionMode}`);
  console.log(`  apiKeySource:   ${details.apiKeySource}`);
  console.log(`  cwd matches:    ${details.cwd === workdir}`);
  console.log(`  tools exposed:  ${details.tools.length}`);
} else {
  console.log("  (no init event on this turn)");
}

console.log("\n=== 4. Turn 2 answers from turn 1's context ===");
// No tool call needed: the code word is already in the transcript.
await session.send(
  "What was the code word? Reply with just that word, nothing else.",
);
const turn2: CortexCodeEvent[] = await drainTurn(session);
console.log(`  reply: ${assistantText(turn2)}`);

console.log("\n=== 5. setModel() applies to subsequent turns ===");
await session.setModel("claude-sonnet-4-5");
await session.send("Reply with exactly: MODEL_SWITCHED");
const turn3: CortexCodeEvent[] = await drainTurn(session);
console.log(`  reply: ${assistantText(turn3)}`);

console.log("\n=== 6. Close ===");
// `CortexCodeSession` is an `AsyncDisposable`, so `await using session = ...`
// closes it at scope exit. Closing explicitly here keeps the ordering visible.
await session.close();
console.log("  session closed");
