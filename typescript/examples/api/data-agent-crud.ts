/**
 * Full CRUD lifecycle for a Cortex Data Agent, plus versioned run.
 *
 * Every newly created data agent gets a default `VERSION$1`, so `streamVersion`
 * / `runVersion` are exercised against that auto-created version.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/data-agent-crud.ts
 */
import {
  AgentResponseView,
  AgentRunStream,
  AsyncRun,
  CortexAgentClient,
  StreamEvent,
  type AgentSchemaTarget,
  type CortexAgentCreateRequest,
  type DataAgentTarget,
  type DataAgentVersionTarget,
  type DescribeAsResourceAgentResponse,
  type ServerSentEvent,
  type ShowAsResourceAgentResponse,
  type SuccessResponse,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

const target: AgentSchemaTarget = {
  database: process.env.SNOWFLAKE_DATABASE!,
  schema: process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC",
};
const agentName: string = `SDK_EXAMPLE_AGENT_${process.pid}`;
const agentTarget: DataAgentTarget = { ...target, name: agentName };
const versionTarget: DataAgentVersionTarget = {
  ...agentTarget,
  version: "VERSION$1",
};
const semanticView: string =
  process.env.SNOWFLAKE_SEMANTIC_VIEW!;
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";

const agentSpec: CortexAgentCreateRequest = {
  name: agentName,
  models: { orchestration: "auto" },
  instructions: {
    orchestration: "Use the analyst tool for stock questions.",
    response: "Be concise.",
  },
  tools: [
    {
      tool_spec: {
        type: "cortex_analyst_text_to_sql",
        name: "analyst",
        description: "Query stocks",
      },
    },
  ],
  tool_resources: {
    analyst: {
      semantic_view: semanticView,
      execution_environment: { type: "warehouse", warehouse },
    },
  } as unknown as Record<string, never>,
};

// 1. Create
console.log("=== Create agent ===");
const createResult: SuccessResponse = (
  await client.agent.create(target, agentSpec, {
    createMode: "orReplace",
  })
).responseBody;
console.log(
  `created ${target.database}.${target.schema}.${agentName} (status: ${createResult?.status ?? "ok"})`,
);

// 2. List
console.log("\n=== List agents ===");
const agents: ShowAsResourceAgentResponse[] = (await client.agent.list(target))
  .responseBody;
for (const a of agents.slice(0, 5)) {
  console.log(`  ${a.name} (owner=${a.owner})`);
}
if (agents.length > 5) console.log(`  ... (${agents.length - 5} more)`);

// 3. Describe
console.log("\n=== Describe agent ===");
const info: DescribeAsResourceAgentResponse = (
  await client.agent.describe(agentTarget)
).responseBody;
console.log(`  name: ${info.name}`);
console.log(`  owner: ${info.owner}`);
console.log(`  database.schema: ${info.database_name}.${info.schema_name}`);

// 4. Update
console.log("\n=== Update agent ===");
const updateResult: SuccessResponse = (
  await client.agent.update(agentTarget, {
    comment: "Updated by SDK example",
  })
).responseBody;
console.log(`updated comment (status: ${updateResult?.status ?? "ok"})`);

// 5. Run (streaming, default version)
console.log("\n=== Run data agent (streamData) ===");
const stream: AgentRunStream = client.agent.streamData(agentTarget, {
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "What's the highest closing price?" }],
    },
  ],
});
stream.on(StreamEvent.Text, (delta: string) => process.stdout.write(delta));
await stream.done();
console.log();

// 6. Run against a specific version (streaming)
console.log(
  `\n=== Run pinned version ${versionTarget.version} (streamVersion) ===`,
);
const versionStream: AgentRunStream = client.agent.streamVersion(
  versionTarget,
  {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "What's the lowest closing price?" }],
      },
    ],
  },
);
versionStream.on(StreamEvent.Text, (delta: string) =>
  process.stdout.write(delta),
);
await versionStream.done();
console.log();

// 7. Non-streaming versioned run — overload returns AgentResponseView directly
console.log(
  `\n=== Non-streaming pinned version (runVersion, stream:false) ===`,
);
const nonStream: AgentResponseView = await client.agent.runVersion(
  versionTarget,
  {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Give me one line about TSLA." }],
      },
    ],
    stream: false,
  },
);
console.log(`  text: "${nonStream.text}"`);
console.log(
  `  content items: ${nonStream.content.length}, toolUses=${nonStream.toolUses.length}`,
);

// 7b. Raw iterator via runData (stream:true) — returns AsyncIterable<ServerSentEvent>
// The `run*` methods with stream:true yield events directly without the
// AgentRunStream callback wrapper. Same underlying endpoint as streamData;
// use this when you want a plain for-await loop without the ergonomics of
// .on() / .finalText() / .abort().
console.log(`\n=== runData with stream:true (raw AsyncIterable) ===`);
let runDataEventCount: number = 0;
const runDataKinds: Set<string> = new Set();
for await (const ev of client.agent.runData(agentTarget, {
  messages: [
    { role: "user", content: [{ type: "text", text: "one line about GS" }] },
  ],
  stream: true,
}) as AsyncIterable<ServerSentEvent>) {
  runDataEventCount++;
  runDataKinds.add(ev.event);
}
console.log(
  `  drained ${runDataEventCount} events, kinds=[${[...runDataKinds].sort().join(", ")}]`,
);

// 7c. Raw iterator via runVersion (stream:true)
console.log(`\n=== runVersion with stream:true (raw AsyncIterable) ===`);
let runVersionEventCount: number = 0;
const runVersionKinds: Set<string> = new Set();
for await (const ev of client.agent.runVersion(versionTarget, {
  messages: [
    { role: "user", content: [{ type: "text", text: "one line about MSFT" }] },
  ],
  stream: true,
}) as AsyncIterable<ServerSentEvent>) {
  runVersionEventCount++;
  runVersionKinds.add(ev.event);
}
console.log(
  `  drained ${runVersionEventCount} events, kinds=[${[...runVersionKinds].sort().join(", ")}]`,
);

// 7d. Background versioned run — returns AsyncRun. Await + touch view methods.
// Background against a versioned data agent needs a thread (server writes the
// assistant's reply into the thread; kickoff returns immediately with a run_id).
console.log(
  `\n=== Background pinned-version run (runVersion, background:true → AsyncRun) ===`,
);
const bgVersionThread = (
  await client.threads.create({ origin_application: "sdk-bg-ver" })
).responseBody;
try {
  const bgRun: AsyncRun = await client.agent.runVersion(versionTarget, {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "one line about AAPL closing prices" }],
      },
    ],
    thread_id: bgVersionThread.thread_id,
    parent_message_id: "0",
    stream: false,
    background: true,
  });
  console.log(`  kickoff: status=${bgRun.initialStatus} run_id=${bgRun.runId}`);

  // .await() drains to completion and materializes an AgentResponseView.
  // Exercise several view accessors to prove the result is a real view.
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
  (await client.threads.delete(bgVersionThread.thread_id)).responseBody;
  console.log(`  deleted bg thread ${bgVersionThread.thread_id}`);
}

// 8. Delete
console.log("\n=== Delete agent ===");
const deleteResult: SuccessResponse = (
  await client.agent.delete(agentTarget, { ifExists: true })
).responseBody;
console.log(
  `deleted ${target.database}.${target.schema}.${agentName} (status: ${deleteResult?.status ?? "ok"})`,
);
