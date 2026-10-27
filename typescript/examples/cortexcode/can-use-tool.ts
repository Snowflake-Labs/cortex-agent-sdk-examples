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
 * `canUseTool` — a programmatic permission handler.
 *
 * When `canUseTool` is set, the SDK stops passing an auto-approve flag to the
 * CLI and every tool call is routed back over the control protocol to your
 * callback. Return `{ behavior: "allow" }` to let it run, or
 * `{ behavior: "deny", message }` to block it and hand the model a reason.
 *
 * Note the callback's `input` shape: it is the CLI's *permission-request*
 * normalization — `{ action, resource }` — not the tool's own argument object.
 * Match on those two fields rather than on tool-specific keys like `file_path`.
 *
 * This example demonstrates:
 *   1. Allowing a tool call, and what `(toolName, input, context)` actually holds
 *   2. Denying a tool call, and how the denial surfaces to the model
 *   3. A path-scoped policy: allow reads inside the workspace, deny the rest
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * can exceed the SDK's 60s `initialize` budget; raise it with
 * `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/can-use-tool.ts
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { query, type CortexCodeEvent } from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-can-use-tool-"));
writeFileSync(join(workdir, "allowed.txt"), "APPROVED\n");
writeFileSync(join(workdir, "secret.txt"), "DENIED\n");

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

console.log("=== 1. Allow — what the callback receives ===");
const observed: Array<{
  tool: string;
  action: unknown;
  resourceTail: string;
  keys: string[];
  hasSignal: boolean;
  hasToolUseID: boolean;
  suggestions: number;
}> = [];
const events1: CortexCodeEvent[] = [];
for await (const event of query({
  prompt:
    "Read allowed.txt in the current directory and reply with only the single " +
    "word it contains. No line numbers, no commentary.",
  options: {
    cwd: workdir,
    // Skip the CLI's launch-time auto-update check: in a scripted run it can
    // push startup past the SDK's `initialize` budget, and a pinned CLI is what
    // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
    extraArgs: { "no-auto-update": null },
    onlyExplicitMcpServers: true,
    canUseTool: async (toolName, input, context) => {
      observed.push({
        tool: toolName,
        action: input.action,
        // Print only the basename: the temp-dir prefix changes every run.
        resourceTail:
          String(input.resource ?? "")
            .split("/")
            .pop() ?? "",
        keys: Object.keys(input).sort(),
        hasSignal: context.signal instanceof AbortSignal,
        hasToolUseID:
          typeof context.toolUseID === "string" && context.toolUseID.length > 0,
        suggestions: context.suggestions.length,
      });
      return { behavior: "allow" };
    },
    ...(connection ? { connection } : {}),
  },
})) {
  events1.push(event);
}
for (const call of observed) {
  console.log(`  tool:               ${call.tool}`);
  console.log(`  input keys:         [${call.keys.join(", ")}]`);
  console.log(`  input.action:       ${JSON.stringify(call.action)}`);
  console.log(`  input.resource ends with: ${call.resourceTail}`);
  console.log(
    `  context.signal:     ${call.hasSignal ? "AbortSignal" : "(absent)"}`,
  );
  console.log(
    `  context.toolUseID:  ${call.hasToolUseID ? "set" : "(absent)"}`,
  );
  console.log(`  context.suggestions: ${call.suggestions}`);
}
console.log(`  reply: ${assistantText(events1)}`);

console.log("\n=== 2. Deny — the model is told why ===");
const denied: string[] = [];
const events2: CortexCodeEvent[] = [];
for await (const event of query({
  prompt:
    "Read secret.txt in the current directory. If the read is refused, reply with exactly BLOCKED and stop.",
  options: {
    cwd: workdir,
    // Skip the CLI's launch-time auto-update check: in a scripted run it can
    // push startup past the SDK's `initialize` budget, and a pinned CLI is what
    // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
    extraArgs: { "no-auto-update": null },
    onlyExplicitMcpServers: true,
    canUseTool: async (toolName) => {
      denied.push(toolName);
      return {
        behavior: "deny",
        message: "secret.txt is off limits for this example.",
      };
    },
    ...(connection ? { connection } : {}),
  },
})) {
  events2.push(event);
}
console.log(`  tools denied by the callback: [${denied.join(", ")}]`);
console.log(`  reply: ${assistantText(events2)}`);
const result2 = events2.find((e) => e.type === "result");
if (result2?.type === "result") {
  console.log(`  result subtype: ${result2.subtype}`);
  // `permission_denials` is the CLI's own record of *rule-based* denials. An
  // SDK-side `canUseTool` deny is delivered to the model as a tool error, so it
  // does not necessarily appear here — the callback is your audit point.
  console.log(
    `  result.permission_denials: ${result2.permission_denials.length}`,
  );
}

console.log("\n=== 3. A path-scoped policy ===");
// The realistic shape of a policy: decide from `action` + `resource`. Here reads
// of allowed.txt pass and everything else is refused, so the agent can complete
// the first half of the prompt and not the second.
//
// The prompt insists on one read at a time. Batched tool calls are asked about
// as a group, and one denial cancels the whole batch — which would hide the
// allow decision this section is meant to show.
const decisions: Array<{ resourceTail: string; verdict: string }> = [];
const events3: CortexCodeEvent[] = [];
for await (const event of query({
  prompt:
    "First read allowed.txt and report its contents. Only after that finishes, " +
    "read secret.txt and report its contents or that it was refused. Read the " +
    "files one at a time, never both in the same step.",
  options: {
    cwd: workdir,
    // Skip the CLI's launch-time auto-update check: in a scripted run it can
    // push startup past the SDK's `initialize` budget, and a pinned CLI is what
    // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
    extraArgs: { "no-auto-update": null },
    onlyExplicitMcpServers: true,
    canUseTool: async (_toolName, input) => {
      const resource = String(input.resource ?? "");
      const tail = resource.split("/").pop() ?? "";
      const allow = tail === "allowed.txt";
      decisions.push({ resourceTail: tail, verdict: allow ? "allow" : "deny" });
      return allow
        ? { behavior: "allow" }
        : { behavior: "deny", message: `Access to ${tail} is not permitted.` };
    },
    ...(connection ? { connection } : {}),
  },
})) {
  events3.push(event);
}
for (const decision of decisions) {
  console.log(`  ${decision.verdict.padEnd(5)} ${decision.resourceTail}`);
}
console.log(`  reply: ${assistantText(events3)}`);
