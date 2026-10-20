/**
 * Run a data agent, capture the request_id from response headers, then send
 * feedback tied to that request.
 *
 * The feedback endpoint keys off `request_id` — the value of the
 * `x-snowflake-request-id` header on the run's HTTP response — NOT a
 * `run_id` from an SSE metadata event. `AgentRunStream.requestId` exposes it
 * after the response headers arrive (safe to read once `done()` resolves).
 *
 * Creates its own data agent with a cortex_analyst_text_to_sql tool so the
 * example is self-contained.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/send-feedback.ts
 */
import {
  AgentRunStream,
  CortexAgentClient,
  StreamEvent,
  type CortexAgentCreateRequest,
  type DataAgentTarget,
  type SuccessResponse,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

// --- Set up a data agent with just an analyst tool ---
const target: DataAgentTarget = {
  database: process.env.SNOWFLAKE_DATABASE!,
  schema: process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC",
  name: `SDK_FEEDBACK_EXAMPLE_${process.pid}`,
};
const semanticView: string =
  process.env.SNOWFLAKE_SEMANTIC_VIEW!;
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";
const agentSpec: CortexAgentCreateRequest = {
  name: target.name,
  models: { orchestration: "auto" },
  instructions: {
    orchestration: "Use the analyst tool.",
    response: "Be concise.",
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
    { database: target.database, schema: target.schema },
    agentSpec,
    {
      createMode: "orReplace",
    },
  )
).responseBody;
console.log(`Created data agent ${target.name}`);

const stream: AgentRunStream = client.agent.streamData(target, {
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "What can you help me with?" }],
    },
  ],
});

stream
  .on(StreamEvent.Text, (delta: string) => process.stdout.write(delta))
  .on(StreamEvent.Error, (err: Error) => {
    console.log(`\nStream error: ${err.message}`);
  });

await stream.done();
process.stdout.write("\n");

const requestId: string | undefined = stream.requestId;
if (!requestId) {
  console.log("No request_id captured — cannot attach feedback.");
  (await client.agent.delete(target, { ifExists: true })).responseBody;
  process.exit(1);
}

console.log(`\nrequest_id: ${requestId}`);

const result: SuccessResponse = (
  await client.feedback.send(target, {
    request_id: requestId,
    positive: true,
    feedback_message: "Great response!",
    categories: ["helpful"],
  })
).responseBody;
console.log(
  `feedback recorded for request ${requestId} (status: ${result?.status ?? "ok"})`,
);

// --- Cleanup ---
(await client.agent.delete(target, { ifExists: true })).responseBody;
console.log(`Deleted agent ${target.name}`);
