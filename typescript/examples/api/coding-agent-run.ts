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
 * First-class coding-agent support via `client.codingAgent.*` + durable
 * `Conversation.send()` turns.
 *
 * The coding-agent resource wraps the `code_toolset_all` tool + its `tool_resources`
 * shape and the top-level `skills` field with typed, camelCase knobs. Under
 * the hood it expands into the standard `AgentRunRequest` and delegates to
 * `client.agent.*`.
 *
 * This example demonstrates:
 *   1. Streaming coding-agent run with permission_policy = always_allow
 *   2. Non-streaming coding-agent run with disabled_skills
 *   3. Workspace mount — file write + read within a single turn
 *   4. Multi-turn via Conversation.send — workspace persistence across turns
 *   5. Client-side validation — nested mountPath throws before hitting the wire
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/coding-agent-run.ts
 *
 * On default (MY_USER), USER$MY_USER.PUBLIC.DEFAULT$ is a
 * pre-provisioned workspace with a live version.
 */
import {
  AgentResponseView,
  AsyncRun,
  CortexAgentClient,
  CortexAgentError,
  MessageContentView,
  StreamEvent,
  expandCodingAgentRequest,
  type AgentRunStream,
  type ServerSentEvent,
} from "@snowflake/cortex-agent-sdk/api";
import { CortexAgentClient as ConversationClient } from "@snowflake/cortex-agent-sdk";
import type { AgentResponse, Conversation } from "@snowflake/cortex-agent-sdk";

/**
 * Extract only the actual bash stdout from successful tool_result content
 * entries (drops the "Bash command `..` with description `..` returned output: "
 * prefix so we don't match the shell command's own echoed text). Failed
 * commands are skipped.
 */
function extractBashStdout(view: MessageContentView): string {
  const parts: string[] = [];
  for (const tr of view.toolResults) {
    const status = (tr.tool_result as { status?: string }).status;
    if (status !== "success") continue;
    for (const c of tr.tool_result.content ?? []) {
      const text = (c as { text?: string }).text ?? "";
      const m = /returned output:\s?([\s\S]*)$/.exec(text);
      if (m && m[1] !== undefined) parts.push(m[1]);
    }
  }
  return parts.join("\n");
}

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});
const conversationClient: ConversationClient = new ConversationClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

const workspaceFqn: string =
  process.env.SNOWFLAKE_WORKSPACE ?? "USER$MY_USER.PUBLIC.DEFAULT$";

// --- 1. Streaming coding-agent run: always_allow — verify NO permission prompt fires ---
// Wire-level check (mirrors the doc's test for permission_policy = always_allow):
// destructive-looking commands must run immediately, with no `permission` field
// on tool_use events and no `client_tool_use_request` status event.
console.log(
  "=== 1. codingAgent.stream — always_allow bash, no permission prompt ===",
);
const stream1: AgentRunStream = client.codingAgent.stream({
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          // A high-risk-looking command: exact form the doc uses. always_allow
          // should let it through unprompted.
          text: "run this exact command in bash: rm -rf /tmp/coding-agent-example-nonexistent",
        },
      ],
    },
  ],
  permissionPolicy: "always_allow",
  models: { orchestration: "claude-sonnet-4-5" },
});
let text1: string = "";
let sawPermissionPrompt: boolean = false;
let sawClientToolUseRequest: boolean = false;
stream1.on(StreamEvent.Text, (delta: string) => {
  text1 += delta;
});
stream1.on(StreamEvent.ToolUse, (ev) => {
  // The doc: with always_allow, tool_use events carry no `permission` field.
  if ((ev as { permission?: unknown }).permission) sawPermissionPrompt = true;
});
stream1.on(StreamEvent.Status, (ev) => {
  // The doc: without a prompt, status never reaches "client_tool_use_request".
  if ((ev as { status?: string }).status === "client_tool_use_request") {
    sawClientToolUseRequest = true;
  }
});
await stream1.done();
console.log(`  final text: ${text1.trim()}`);
console.log(`  request_id: ${stream1.requestId}`);
console.log(
  `  wire check — permission field on tool_use? ${sawPermissionPrompt}  (expected: false)`,
);
console.log(
  `  wire check — client_tool_use_request status?  ${sawClientToolUseRequest}  (expected: false)`,
);

// --- 2. Non-streaming coding-agent run: inspect the wire shape + disabled_skills ---
console.log(
  "\n=== 2. codingAgent.run non-streaming — expandCodingAgentRequest + disabledSkills ===",
);

// expandCodingAgentRequest is exported so callers can inspect exactly what the SDK
// puts on the wire before dispatching. Handy for debugging permission /
// mount configuration.
const wireShape = expandCodingAgentRequest({
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  permissionPolicy: "always_allow",
  disabledSkills: ["dashboard"],
  workspaceMounts: [{ name: workspaceFqn, mountPath: "/workspace" }],
  stageSkills: [
    { name: "e2e_probe", path: "@DB.SCHEMA.STAGE/skills/e2e_probe" },
  ],
  models: { orchestration: "claude-sonnet-4-5" },
});
console.log(`  expanded tools:          ${JSON.stringify(wireShape.tools)}`);
console.log(
  `  expanded tool_resources: ${JSON.stringify(wireShape.tool_resources)}`,
);
console.log(`  expanded skills:         ${JSON.stringify(wireShape.skills)}`);

// Live call with disabledSkills; the assistant response is prose so we don't
// binary-check it here — but the wire dump above proves the SDK sent
// { tool_resources: { code_toolset_all: { disabled_skills: ["dashboard"], ... } } }.
const view2: AgentResponseView = await client.codingAgent.run({
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Do you have a skill called 'dashboard' available to you right now? Answer 'yes' or 'no' only.",
        },
      ],
    },
  ],
  permissionPolicy: "always_allow",
  disabledSkills: ["dashboard"],
  models: { orchestration: "claude-sonnet-4-5" },
  stream: false,
});
console.log(`  assistant reply: ${view2.text.trim()}`);

// --- 3. Workspace mount: SDK-side check (wire shape) + functional bash roundtrip ---
// The SDK is responsible only for constructing the right wire shape. Whether
// the workspace actually mounts server-side depends on it having a live version
// and on server-side sandbox health. On silent mount failure the server falls
// back to an ephemeral container dir at the same path — writes still succeed
// within one sandbox but nothing persists.
//
// This section only proves the write/read round-trip inside one sandbox, which
// passes either way. Section 4 is what actually distinguishes a real mount from
// the fallback, by reading the file back on a later turn and from a second
// thread. Deliberately no /proc/mounts probing here: the sandbox's internal
// mount layout is not a public contract, and this transcript is checked in.
console.log("\n=== 3. codingAgent.run — workspace_mounts ===");
const marker: string = `CODING_AGENT_WS_${Date.now()}`;
const view3: AgentResponseView = await client.codingAgent.run({
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          // One bash invocation with && chaining forces sequential execution.
          // Otherwise the model may split into separate tool_use calls and
          // reorder (e.g. cat before echo), so the marker isn't yet in the file
          // when cat runs.
          text:
            `Run this exact bash command in a SINGLE bash invocation and report the full stdout verbatim:\n` +
            `echo ${marker} > /workspace/coding-agent-example.txt && cat /workspace/coding-agent-example.txt`,
        },
      ],
    },
  ],
  permissionPolicy: "always_allow",
  workspaceMounts: [{ name: workspaceFqn }],
  models: { orchestration: "claude-sonnet-4-5" },
  stream: false,
});
const bashStdout: string = extractBashStdout(view3);
const roundtripped: boolean = bashStdout.includes(marker);
console.log(`  wrote marker ${marker} to /workspace/coding-agent-example.txt`);
console.log(
  `  marker roundtripped in bash stdout? ${roundtripped}  (SDK path OK)`,
);
console.log(
  `  (real-mount proof is section 4: same file read back across turns and threads)`,
);
console.log(`  bash stdout:\n${bashStdout}`);

// --- 4. Multi-turn via Conversation.send — workspace persists across turns ---
console.log("\n=== 4. Conversation.send — persistence across turns ===");
const conversationAgent = {
  type: "coding" as const,
  spec: {
    permissionPolicy: "always_allow" as const,
    workspaceMounts: [{ name: workspaceFqn }],
    models: { orchestration: "claude-sonnet-4-5" },
  },
};
const convo: Conversation = await conversationClient.conversations.create({
  thread: { origin_application: "sdk-code-ex" },
  agent: conversationAgent,
});
console.log(`  created thread ${convo.id}`);

const persistentMarker: string = `CODING_AGENT_PERSIST_${Date.now()}`;
const turn1: AgentResponse = await (
  await convo.send(
    `Run: echo ${persistentMarker} > /workspace/persist.txt && cat /workspace/persist.txt`,
  )
).result();
console.log(`  turn 1 reply: ${turn1.text}`);

const turn2: AgentResponse = await (
  await convo.send(`Run: cat /workspace/persist.txt`)
).result();
const persistedSameThread: boolean = turn2.text.includes(persistentMarker);
console.log(`  turn 2 reply: ${turn2.text}`);
console.log(
  `  marker present in turn 2 (same-thread persistence)? ${persistedSameThread}  (expected: true)`,
);

// Cross-thread persistence check: workspace is user-scoped by design, so a
// different thread on the same user's default workspace should see the same
// file. This depends on the server-side mount succeeding (see section 3
// caveat); when the v-stage silently no-mounts, each sandbox gets its own
// ephemeral /workspace and the file is invisible cross-thread.
const convo2: Conversation = await conversationClient.conversations.create({
  thread: { origin_application: "sdk-code-ex" },
  agent: conversationAgent,
});
const crossThread: AgentResponse = await (
  await convo2.send(`Run: cat /workspace/persist.txt 2>&1`)
).result();
const crossThreadStdout: string = extractBashStdout(crossThread);
const persistedCrossThread: boolean =
  crossThreadStdout.includes(persistentMarker);
console.log(
  `  marker visible from a NEW thread?   ${persistedCrossThread}  (depends on real v-stage mount; false = ephemeral fallback)`,
);
console.log(
  `  cross-thread bash stdout: ${crossThreadStdout || "(no successful commands)"}`,
);

await convo.delete();
await convo2.delete();
console.log(`  deleted threads ${convo.id} and ${convo2.id}`);

// --- 4b. codingAgent.run with stream:true — raw AsyncIterable<ServerSentEvent> ---
// Same underlying endpoint as codingAgent.stream, but yields events directly without
// the AgentRunStream callback wrapper. Useful when you want a plain for-await
// loop and don't need .on() / .finalText() / .abort().
console.log(`\n=== 4b. codingAgent.run stream:true — raw AsyncIterable ===`);
let iterEventCount: number = 0;
const iterKinds: Set<string> = new Set();
for await (const ev of client.codingAgent.run({
  messages: [
    { role: "user", content: [{ type: "text", text: "run: echo ITER_OK" }] },
  ],
  permissionPolicy: "always_allow",
  models: { orchestration: "claude-sonnet-4-5" },
  stream: true,
}) as AsyncIterable<ServerSentEvent>) {
  iterEventCount++;
  iterKinds.add(ev.event);
  // Print each event verbatim so callers can see exactly what the wire yields.
  console.log(`  [${iterEventCount}] ${JSON.stringify(ev)}`);
}
console.log(
  `  summary: drained ${iterEventCount} events, kinds=[${[...iterKinds].sort().join(", ")}]`,
);

// --- 4c. codingAgent.run background:true — kickoff returns an AsyncRun handle ---
// The server executes the run in the background and commits its reply to the
// thread; kickoff returns immediately with a run_id. .await() drains to
// completion and materializes an AgentResponseView, which we then introspect.
console.log(
  `\n=== 4c. codingAgent.run background:true → AsyncRun.await() → view ===`,
);
const bgThread = (
  await client.threads.create({ origin_application: "sdk-code-bg" })
).responseBody;
try {
  const bgRun: AsyncRun = await client.codingAgent.run({
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "run: echo BG_ASYNCRUN_OK" }],
      },
    ],
    permissionPolicy: "always_allow",
    models: { orchestration: "claude-sonnet-4-5" },
    thread_id: bgThread.thread_id,
    parent_message_id: "0",
    stream: false,
    background: true,
  });
  console.log(`  kickoff: status=${bgRun.initialStatus} run_id=${bgRun.runId}`);

  const bgView: AgentResponseView = await bgRun.result();
  console.log(`  view.role:            ${bgView.role}`);
  console.log(`  view.text (first 200): ${bgView.text.slice(0, 200)}`);
  console.log(`  view.content.length:  ${bgView.content.length}`);
  console.log(`  view.texts.length:    ${bgView.texts.length}`);
  console.log(`  view.toolUses.length: ${bgView.toolUses.length}`);
  console.log(`  view.toolResults.len: ${bgView.toolResults.length}`);
  console.log(`  view.metadata.run_id: ${bgView.metadata?.run_id ?? "-"}`);
  console.log(
    `  view.events?.length:  ${bgView.events?.length ?? "(from thread, no events)"}`,
  );
} finally {
  (await client.threads.delete(bgThread.thread_id)).responseBody;
  console.log(`  deleted bg thread ${bgThread.thread_id}`);
}

// --- 5. Client-side validation: nested mount_path is rejected before wire ---
console.log("\n=== 5. Client-side validation ===");
try {
  await client.codingAgent.run({
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    workspaceMounts: [{ name: workspaceFqn, mountPath: "/workspace/nested" }],
    stream: false,
  });
  console.log(`  UNEXPECTED: nested mountPath was accepted`);
} catch (err) {
  if (err instanceof CortexAgentError) {
    console.log(`  ✓ nested mountPath rejected: ${err.message}`);
  } else {
    throw err;
  }
}

try {
  await client.codingAgent.run({
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    workspaceMounts: [{ name: "" }],
    stream: false,
  });
  console.log(`  UNEXPECTED: empty workspace name was accepted`);
} catch (err) {
  if (err instanceof CortexAgentError) {
    console.log(`  ✓ empty workspace name rejected: ${err.message}`);
  } else {
    throw err;
  }
}
