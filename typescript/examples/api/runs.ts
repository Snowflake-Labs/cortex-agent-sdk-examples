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
 * Exercises all three `client.runs.*` methods against a real background run.
 *
 *   client.runs.stream(runId, {startingAfter?})   raw AsyncIterable<ServerSentEvent>
 *   client.runs.resume(runId, {startingAfter?})   AgentRunStream (callback API)
 *   client.runs.cancel(runId)                     Promise<CancelAgentRunResponse>
 *
 * Both `stream` and `resume` hit the same endpoint
 * (`GET /api/v2/cortex/agent/runs/{run_id}`); they differ only in the
 * client-side wrapper. `startingAfter` skips events before a given sequence
 * number — handy for reconnecting mid-run without replaying from scratch.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/runs.ts
 */
import {
  AgentResponseView,
  AgentRunStream,
  AsyncRun,
  type TurnResultOptions,
  CortexAgentAPIError,
  CortexAgentClient,
  StreamEvent,
  type CancelAgentRunResponse,
  type CortexAgentCreateRequest,
  type DataAgentTarget,
  type ServerSentEvent,
  type SuccessResponse,
  type ThreadMetadata,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

// --- Setup: create a data agent so the cancel section (which needs a
//     long-running streaming run) reliably hits v2 + emits response.text.delta. ---
const dataAgent: DataAgentTarget = {
  database: process.env.SNOWFLAKE_DATABASE!,
  schema: process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC",
  name: `SDK_RUNS_EXAMPLE_${process.pid}`,
};
const semanticView: string =
  process.env.SNOWFLAKE_SEMANTIC_VIEW!;
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";
const agentSpec: CortexAgentCreateRequest = {
  name: dataAgent.name,
  models: { orchestration: "auto" },
  instructions: {
    orchestration: "Answer thoroughly.",
    response: "Be verbose.",
  },
  tools: [
    { tool_spec: { type: "cortex_analyst_text_to_sql", name: "analyst" } },
  ],
  tool_resources: {
    analyst: {
      semantic_view: semanticView,
      execution_environment: { type: "warehouse", warehouse },
    },
  } as unknown as Record<string, never>,
};
(
  await client.agent.create(
    { database: dataAgent.database, schema: dataAgent.schema },
    agentSpec,
    {
      createMode: "orReplace",
    },
  )
).responseBody;
console.log(`Created data agent ${dataAgent.name}`);

// --- Thread + background run so we have a real run_id to operate on ---
const thread: ThreadMetadata = (
  await client.threads.create({
    origin_application: "sdk-runs-ex",
  })
).responseBody;
console.log(`Created thread ${thread.thread_id}`);

const kickoff: AsyncRun = await client.agent.run({
  models: { orchestration: "auto" },
  thread_id: thread.thread_id,
  parent_message_id: "0",
  background: true,
  stream: false,
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "In one sentence, what is Snowflake?" }],
    },
  ],
});
const runId: string = kickoff.runId;
console.log(
  `Kicked off background run ${runId} (status: ${kickoff.initialStatus})\n`,
);
console.log(`Kickoff request id: ${kickoff.requestId ?? "(none)"}`);

// === 0. AsyncRun.await() → materialize the final AgentResponseView ===
// Higher-level than runs.stream/resume: waits for the run to complete and
// returns a typed view over the final content. It tries the live stream first
// and falls back to the persisted thread reply when live streaming is unavailable.
console.log("=== 0. AsyncRun.await() → AgentResponseView ===");
const kickoffView: AgentResponseView = await kickoff.result();
console.log("  run.await() used with no options");
console.log(`  view.role:            ${kickoffView.role}`);
console.log(`  view.text:            ${kickoffView.text.trim()}`);
console.log(`  view.content.length:  ${kickoffView.content.length}`);
console.log(`  view.texts.length:    ${kickoffView.texts.length}`);
console.log(`  view.toolUses.length: ${kickoffView.toolUses.length}`);
console.log(`  view.toolResults.len: ${kickoffView.toolResults.length}`);
console.log(`  view.metadata.run_id: ${kickoffView.metadata?.run_id ?? "-"}`);
console.log(
  `  view.events?.length:  ${kickoffView.events?.length ?? "(from thread, no events)"}`,
);

// If you need to tune await(), these are the available options.
const awaitController = new AbortController();
const awaitOptions: TurnResultOptions = {
  signal: awaitController.signal, // Abort the overall await() call from the client side.
  streamReadTimeoutMs: 180_000, // Dead-socket timeout while reading the live SSE run stream.
  retryPolicy: { maxRetries: 1, retryStreaming: true }, // If the live stream request or a fallback poll fails transiently, try that read/observe request one more time; this does not submit the background run again.
  headers: { "X-Trace-ID": `sdk-runs-example-${process.pid}` }, // Standard request headers merged into the live stream and fallback polls.
  fallbackToThread: true, // If live run access fails, poll the thread for the persisted assistant reply.
  threadFallbackTimeoutMs: 30_000, // Total time budget for that thread-polling fallback path.
  pollIntervalMs: 1_000, // Delay between threads.describe() polls during fallback.
};
const replayedView: AgentResponseView = await kickoff.result(awaitOptions);
console.log(
  `  replayed with awaitOptions: role=${replayedView.role}, content.length=${replayedView.content.length}\n`,
);

// === 1. runs.stream — raw for-await, count events, remember highest seq no ===
console.log("=== 1. runs.stream (raw AsyncIterable) ===");
let firstStreamCount: number = 0;
let highestSeq: number = 0;
const kinds: Set<string> = new Set();
for await (const ev of client.runs.stream(runId)) {
  firstStreamCount++;
  kinds.add(ev.event);
  const seq: number | undefined = (
    ev as ServerSentEvent & { sequence_number?: number }
  ).sequence_number;
  if (typeof seq === "number" && seq > highestSeq) highestSeq = seq;
}
console.log(
  `  drained ${firstStreamCount} events, kinds=[${[...kinds].sort().join(", ")}], highest seq=${highestSeq}`,
);

// === 2. runs.resume — same endpoint, wrapped as AgentRunStream (callback API) ===
console.log("\n=== 2. runs.resume (AgentRunStream wrapper) ===");
const resumed: AgentRunStream = client.runs.resume(runId);
resumed.on(StreamEvent.Text, (delta: string) => process.stdout.write(delta));
resumed.on(StreamEvent.End, () => console.log("\n  [end] fired"));
process.stdout.write("  text: ");
await resumed.done();
console.log(`  final text length: ${resumed.currentText.length} chars`);

// === 3. runs.stream with startingAfter — skip already-seen events ===
console.log("\n=== 3. runs.stream with startingAfter ===");
const midpoint: number = Math.floor(highestSeq / 2);
let tailCount: number = 0;
for await (const _ev of client.runs.stream(runId, { startingAfter: midpoint }))
  tailCount++;
console.log(
  `  starting_after=${midpoint}: got ${tailCount} events (vs ${firstStreamCount} from the start)`,
);

// === 4. runs.cancel — only meaningful for async (background: true) runs.
//    Cancel signals the worker to stop; it does NOT abort a foreground
//    stream=true call (that's what AbortSignal / stream.abort() is for —
//    those just close the client's HTTP socket). A background run's
//    execution is decoupled from the HTTP request, so we need the endpoint
//    to reach the worker. ===
console.log("\n=== 4. runs.cancel (background run) ===");
const bgLong: AsyncRun = await client.agent.runData(dataAgent, {
  thread_id: thread.thread_id,
  parent_message_id: "0",
  background: true,
  stream: false,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Write a very long, detailed essay about distributed systems.",
        },
      ],
    },
  ],
});
const cancelRunId: string = bgLong.runId;
console.log(
  `  kicked off background run: status=${bgLong.initialStatus} run_id=${cancelRunId}`,
);

// Cancel via the AsyncRun handle (equivalent to client.runs.cancel(cancelRunId)).
const cancelResult: CancelAgentRunResponse = (await bgLong.cancel())
  .responseBody;
console.log(
  `  cancel returned: assistant_message_id=${cancelResult.metadata?.assistant_message_id ?? "-"}`,
);

// Reconnect and see what got persisted (partial output is saved to the
// thread on cancel — assistant_message_id above is that message).
try {
  const post: AgentRunStream = client.runs.resume(cancelRunId);
  await post.done();
  console.log(
    `  post-cancel replay: ${post.currentText.length} chars streamed`,
  );
} catch (err) {
  const msg =
    err instanceof CortexAgentAPIError
      ? `HTTP ${err.status}`
      : (err as Error).message;
  console.log(`  post-cancel replay threw: ${msg}`);
}

// --- Cleanup ---
const del: SuccessResponse = (await client.threads.delete(thread.thread_id))
  .responseBody;
(await client.agent.delete(dataAgent, { ifExists: true })).responseBody;
console.log(
  `\nDeleted thread ${thread.thread_id} (${del?.status ?? "ok"}) + agent ${dataAgent.name}`,
);
