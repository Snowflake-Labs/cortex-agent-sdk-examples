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
 * Interrupting a turn — `AbortController` and `Query.interrupt()`.
 *
 * An interrupt is the programmatic equivalent of pressing ESC in the CLI: the
 * current turn is cut short but the session survives, so the next `send()` picks
 * up with the transcript intact. It is *not* a kill — use `close()` for that.
 *
 * Two ways in:
 *   - `options.abortController` — the SDK sends an interrupt when you `abort()`
 *   - `Query.interrupt()` / `CortexCodeSession.interrupt()` — call it directly
 *
 * This example demonstrates:
 *   1. `abortController` cutting a long-running Bash command short
 *   2. The session staying usable for a follow-up turn afterwards
 *
 * `Query.interrupt()` exists on the one-shot `query()` entry point too, but it is
 * deliberately not demonstrated here: against an in-flight `sleep 120` it does not
 * cut the turn short, and the terminal subtype came back `success` on one run and
 * `error_during_execution` on the next. Drive a session with `abortController`
 * when you need an interrupt you can rely on.
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. Every session below
 * passes `--no-auto-update`: the CLI's launch-time update check is a network call
 * that can push startup past the SDK's 60s `initialize` budget, surfacing as
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/interrupt.ts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCortexCodeSession,
  type CortexCodeEvent,
  type CortexCodeSession,
} from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-interrupt-"));

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

console.log("=== 1. abortController interrupts a long Bash command ===");
const controller: AbortController = new AbortController();
const session: CortexCodeSession = await createCortexCodeSession({
  cwd: workdir,
  // Skip the CLI's launch-time auto-update check: in a scripted run it can
  // push startup past the SDK's `initialize` budget, and a pinned CLI is what
  // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
  extraArgs: { "no-auto-update": null },
  allowedTools: ["Bash"],
  onlyExplicitMcpServers: true,
  abortController: controller,
  ...(connection ? { connection } : {}),
});

await session.send(
  "Use Bash to run exactly `sleep 120`, and once it finishes reply with exactly SLEPT.",
);
// Fire the interrupt a few seconds in, well before `sleep 120` could return.
const startedAt: number = Date.now();
const timer = setTimeout(() => controller.abort(), 4_000);
const interrupted: CortexCodeEvent[] = await drainTurn(session);
clearTimeout(timer);
const elapsedMs: number = Date.now() - startedAt;

const interruptedResult = interrupted.find((e) => e.type === "result");
console.log(
  `  turn ended after roughly ${Math.round(elapsedMs / 1000)}s (sleep was 120s)`,
);
console.log(
  `  finished well before the sleep would have: ${elapsedMs < 100_000}`,
);
console.log(
  `  result subtype: ${interruptedResult?.type === "result" ? interruptedResult.subtype : "(none)"}`,
);
const bashCalls = interrupted
  .filter(
    (e): e is Extract<CortexCodeEvent, { type: "assistant" }> =>
      e.type === "assistant",
  )
  .flatMap((e) => e.content)
  .filter((b) => b.type === "tool_use").length;
console.log(`  tool_use blocks in the interrupted turn: ${bashCalls}`);
console.log(`  assistant text: ${assistantText(interrupted) || "(none)"}`);

console.log("\n=== 2. The session survives the interrupt ===");
// An interrupt ends the turn, not the process. The same session takes another
// prompt, and the earlier transcript is still there.
await session.send("Reply with exactly: STILL_ALIVE");
const afterInterrupt: CortexCodeEvent[] = await drainTurn(session);
console.log(`  reply: ${assistantText(afterInterrupt)}`);
console.log(`  CLI process still live: ${session.pid !== undefined}`);
await session.close();
console.log("  session closed");
