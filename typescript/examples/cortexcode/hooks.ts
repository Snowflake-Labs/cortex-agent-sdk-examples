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
 * Hooks — intercept the agent's lifecycle from your own process.
 *
 * `hooks` maps a `HookEvent` to a list of `HookMatcher`s, each holding one or
 * more async callbacks. The CLI invokes them over the control protocol at the
 * matching point in the turn, waits for the return value, and acts on it:
 *
 *   - `{ systemMessage }`  → surfaces as a `system_message` event on the stream
 *   - `{ decision: "block", reason }` on `PreToolUse` → blocks the tool call
 *
 * Hooks are CLI mode only; API mode rejects a non-empty `hooks` map.
 *
 * This example demonstrates:
 *   1. `PreToolUse` observing every tool call, with `matcher` narrowing by tool
 *   2. `PostToolUse` seeing the tool's response
 *   3. Blocking a tool call from `PreToolUse` with `decision: "block"`
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * can exceed the SDK's 60s `initialize` budget; raise it with
 * `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/hooks.ts
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCortexCodeSession,
  type CortexCodeEvent,
  type CortexCodeSession,
  type HookMatcher,
} from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-hooks-"));
writeFileSync(join(workdir, "notes.txt"), "hooks observed this read\n");

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

// ---------------------------------------------------------------------------
// 1 + 2. Observing hooks
// ---------------------------------------------------------------------------
console.log("=== 1. PreToolUse and PostToolUse observe a Read ===");

const preToolUseSeen: Array<{ tool: string; inputKeys: string[] }> = [];
const postToolUseSeen: Array<{ tool: string; hasResponse: boolean }> = [];
const HOOK_NOTICE: string = "hook: Read intercepted";

// `matcher` is a tool-name pattern. Omit it to match every tool.
const preToolUse: HookMatcher = {
  matcher: "Read",
  hooks: [
    async (input) => {
      preToolUseSeen.push({
        tool: input.tool_name ?? "(unknown)",
        inputKeys: Object.keys(input.tool_input ?? {}).sort(),
      });
      return { systemMessage: HOOK_NOTICE };
    },
  ],
};

const postToolUse: HookMatcher = {
  hooks: [
    async (input) => {
      postToolUseSeen.push({
        tool: input.tool_name ?? "(unknown)",
        hasResponse: input.tool_response !== undefined,
      });
      // Returning nothing actionable is fine; the turn continues unchanged.
      return {};
    },
  ],
};

const observing: CortexCodeSession = await createCortexCodeSession({
  cwd: workdir,
  // Skip the CLI's launch-time auto-update check: in a scripted run it can
  // push startup past the SDK's `initialize` budget, and a pinned CLI is what
  // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
  extraArgs: { "no-auto-update": null },
  allowedTools: ["Read"],
  onlyExplicitMcpServers: true,
  hooks: { PreToolUse: [preToolUse], PostToolUse: [postToolUse] },
  ...(connection ? { connection } : {}),
});
await observing.send(
  "Read notes.txt in the current directory and reply with only the single line it " +
    "contains. No code fences, no commentary.",
);
const observed: CortexCodeEvent[] = await drainTurn(observing);
await observing.close();

for (const call of preToolUseSeen) {
  console.log(
    `  PreToolUse:  ${call.tool} tool_input keys [${call.inputKeys.join(", ")}]`,
  );
}
for (const call of postToolUseSeen) {
  console.log(
    `  PostToolUse: ${call.tool} tool_response present: ${call.hasResponse}`,
  );
}
console.log(`  reply: ${assistantText(observed)}`);

console.log(
  "\n=== 2. systemMessage returns to the stream as a system_message event ===",
);
// Whatever a hook returns as `systemMessage` is echoed back to the SDK as its
// own event type, so a host application can show hook activity in its UI.
const systemMessages = observed.filter(
  (e): e is Extract<CortexCodeEvent, { type: "system_message" }> =>
    e.type === "system_message",
);
console.log(`  system_message events: ${systemMessages.length}`);
console.log(
  `  contains the hook's notice: ${systemMessages.some((e) => e.content.includes(HOOK_NOTICE))}`,
);
for (const message of systemMessages) {
  console.log(`    ${message.content}`);
}

// ---------------------------------------------------------------------------
// 3. Blocking hook
// ---------------------------------------------------------------------------
console.log("\n=== 3. PreToolUse can block a tool call ===");
let blockedCount: number = 0;
const blocking: HookMatcher = {
  matcher: "Read",
  hooks: [
    async () => {
      blockedCount += 1;
      return {
        decision: "block",
        reason: "This example blocks all Read calls from PreToolUse.",
      };
    },
  ],
};

const blocked: CortexCodeSession = await createCortexCodeSession({
  cwd: workdir,
  // Skip the CLI's launch-time auto-update check: in a scripted run it can
  // push startup past the SDK's `initialize` budget, and a pinned CLI is what
  // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
  extraArgs: { "no-auto-update": null },
  allowedTools: ["Read"],
  onlyExplicitMcpServers: true,
  hooks: { PreToolUse: [blocking] },
  ...(connection ? { connection } : {}),
});
await blocked.send(
  "Read notes.txt in the current directory. If the read is blocked, reply with exactly HOOK_BLOCKED and stop.",
);
const blockedEvents: CortexCodeEvent[] = await drainTurn(blocked);
await blocked.close();

console.log(`  hook fired ${blockedCount} time(s)`);
console.log(`  reply: ${assistantText(blockedEvents)}`);
const blockedResult = blockedEvents.find((e) => e.type === "result");
console.log(
  `  result subtype: ${blockedResult?.type === "result" ? blockedResult.subtype : "(none)"}`,
);
