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
 * The terminal `result` event: cost, turns, and error reporting.
 *
 * Every turn ends with exactly one `result` event. It is a discriminated union:
 * `subtype: "success"` carries the final assistant text in `result`, while the
 * error subtypes carry an `errors` array instead. Both carry `usage`,
 * `num_turns`, `duration_ms`, and `permission_denials`.
 *
 * This example demonstrates:
 *   1. The full `SDKResultSuccess` shape, including per-turn token usage
 *   2. Per-message usage on `assistant` events, which sums to the turn total
 *   3. `error_max_turns` — a non-success subtype, produced by capping `maxTurns`
 *
 * Token counts and durations vary run to run; the field names do not.
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * (skill discovery, profile load) can exceed the SDK's 60s `initialize` budget;
 * raise it with `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/result-and-usage.ts
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { query, type CortexCodeEvent } from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-result-"));
for (const name of ["alpha.txt", "beta.txt", "gamma.txt"]) {
  writeFileSync(join(workdir, name), `${name} contents\n`);
}

console.log("=== 1. A successful result ===");
const events: CortexCodeEvent[] = [];
for await (const event of query({
  prompt:
    "Read alpha.txt in the current directory and reply with its contents on one " +
    "line. No code fences, no commentary.",
  options: {
    cwd: workdir,
    // Skip the CLI's launch-time auto-update check: in a scripted run it can
    // push startup past the SDK's `initialize` budget, and a pinned CLI is what
    // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
    extraArgs: { "no-auto-update": null },
    allowedTools: ["Read"],
    onlyExplicitMcpServers: true,
    ...(connection ? { connection } : {}),
  },
})) {
  events.push(event);
}

const result = events.find((e) => e.type === "result");
if (result?.type === "result" && result.subtype === "success") {
  console.log(`  subtype:                ${result.subtype}`);
  console.log(`  is_error:               ${result.is_error}`);
  console.log(`  num_turns:              ${result.num_turns}`);
  console.log(`  result:                 ${result.result.trim()}`);
  console.log(`  session_id set:         ${result.session_id.length > 0}`);
  console.log(`  uuid set:               ${result.uuid.length > 0}`);
  console.log(`  duration_ms > 0:        ${result.duration_ms > 0}`);
  console.log(`  permission_denials:     ${result.permission_denials.length}`);
  console.log(`  usage.input_tokens:            ${result.usage.input_tokens}`);
  console.log(`  usage.output_tokens:           ${result.usage.output_tokens}`);
  console.log(
    `  usage.cache_read_input_tokens: ${result.usage.cache_read_input_tokens ?? 0}`,
  );
  console.log(
    `  structured_output present:     ${result.structured_output !== undefined}`,
  );
} else {
  console.log(`  unexpected result: ${JSON.stringify(result)}`);
}

console.log("\n=== 2. Per-message usage on assistant events ===");
// The turn total in `result.usage` is the sum over the turn's assistant
// messages. Reading them individually is how you attribute spend to a
// particular step of a multi-step turn.
//
// `message.usage` is not populated on every assistant event — messages the CLI
// synthesizes locally carry no token accounting — so treat it as optional.
const assistantMessages = events.filter(
  (e): e is Extract<CortexCodeEvent, { type: "assistant" }> =>
    e.type === "assistant",
);
let outputTotal: number = 0;
assistantMessages.forEach((message, index) => {
  const usage = message.message.usage as
    typeof message.message.usage | undefined;
  outputTotal += usage?.output_tokens ?? 0;
  const kinds = message.content.map((b) => b.type).join("+") || "(empty)";
  console.log(
    `  [${index}] blocks=${kinds} usage=${
      usage
        ? `in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${usage.cache_read_input_tokens ?? 0}`
        : "(absent)"
    }`,
  );
});
console.log(`  assistant messages: ${assistantMessages.length}`);
console.log(`  summed output_tokens: ${outputTotal}`);

console.log("\n=== 3. A non-success result: error_max_turns ===");
// `maxTurns` caps the agentic loop. Asking for three sequential file reads with
// a 1-turn budget forces the CLI to stop early and report the cap rather than
// a success. `errors` replaces `result` on the error subtypes.
const cappedEvents: CortexCodeEvent[] = [];
for await (const event of query({
  prompt:
    "Read alpha.txt, then beta.txt, then gamma.txt, one at a time, and summarize all three.",
  options: {
    cwd: workdir,
    // Skip the CLI's launch-time auto-update check: in a scripted run it can
    // push startup past the SDK's `initialize` budget, and a pinned CLI is what
    // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
    extraArgs: { "no-auto-update": null },
    allowedTools: ["Read"],
    onlyExplicitMcpServers: true,
    maxTurns: 1,
    ...(connection ? { connection } : {}),
  },
})) {
  cappedEvents.push(event);
}
const capped = cappedEvents.find((e) => e.type === "result");
if (capped?.type === "result") {
  console.log(`  subtype:  ${capped.subtype}`);
  console.log(`  is_error: ${capped.is_error}`);
  console.log(`  num_turns: ${capped.num_turns}`);
  if (capped.is_error) {
    console.log(`  errors:   ${JSON.stringify(capped.errors)}`);
  } else {
    console.log(
      `  completed within the cap; result: ${capped.result.trim().slice(0, 80)}`,
    );
  }
}
