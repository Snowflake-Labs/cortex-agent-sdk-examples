/**
 * Non-streaming agent runs — both lite and data agent.
 *
 * Non-streaming mode returns the complete response in a single JSON payload.
 * Useful when you need the full response before processing (e.g., structured
 * output, batch processing, or when latency to first token doesn't matter).
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/non-streaming.ts
 */
import {
  CortexAgentClient,
  CortexAgentAPIError,
  AgentResponseView,
  AsyncRun,
  type AgentResponse,
  type DataAgentTarget,
  type CortexAgentCreateRequest,
  type SuccessResponse,
  type ThreadMetadata,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

// --- Example 1: Lite agent, non-streaming ---
console.log("=== Lite agent (non-streaming) ===");
try {
  const response: AgentResponseView = await client.agent.run({
    models: { orchestration: "auto" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is 2+2? Reply with just the number." },
        ],
      },
    ],
    stream: false,
  });

  console.log(`  role: ${response.role}`);
  console.log(`  content items: ${response.content.length}`);
  console.log(`  text: "${response.text}"`);
  console.log(`  run_id: ${response.metadata?.run_id}`);
} catch (err) {
  if (err instanceof CortexAgentAPIError) {
    console.log(
      `  Note: non-streaming not supported on this host (${err.name}: ${err.message})`,
    );
    console.log(`  request_id: ${err.requestId}`);
  } else {
    throw err;
  }
}

// --- Example 2: Non-streaming with requestWithResponse (get headers) ---
console.log("\n=== Non-streaming + requestWithResponse ===");
try {
  const apiResponse = await client.requestWithResponse<AgentResponse>(
    "/api/v2/cortex/agent:run",
    {
      method: "POST",
      body: {
        models: { orchestration: "auto" },
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Name one color." }],
          },
        ],
        stream: false,
      },
    },
  );
  console.log(`  x-snowflake-request-id: ${apiResponse.requestId}`);
  // client.requestWithResponse is the low-level path — it returns the parsed
  // AgentResponse plus the HTTP Response. fromAPIResponse keeps both and adds
  // the typed accessors.
  const response = AgentResponseView.fromAPIResponse(apiResponse);
  console.log(`  text: "${response.text}"`);
} catch (err) {
  if (err instanceof CortexAgentAPIError) {
    console.log(
      `  Note: non-streaming not supported on this host (${err.name})`,
    );
  } else {
    throw err;
  }
}

// --- Example 3: Data agent, non-streaming ---
// Create a self-contained data agent bound to the STOCKS_DATA semantic view,
// run a non-streaming query, then clean up.
console.log("\n=== Data agent (non-streaming) ===");
const target: DataAgentTarget = {
  database: process.env.SNOWFLAKE_DATABASE!,
  schema: process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC",
  name: `SDK_NONSTREAMING_EXAMPLE_${process.pid}`,
};
const semanticView: string =
  process.env.SNOWFLAKE_SEMANTIC_VIEW!;
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";

const agentSpec: CortexAgentCreateRequest = {
  name: target.name,
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
const createResult: SuccessResponse = (
  await client.agent.create(
    { database: target.database, schema: target.schema },
    agentSpec,
    {
      createMode: "orReplace",
    },
  )
).responseBody;
console.log(
  `  created ${target.database}.${target.schema}.${target.name} (${createResult?.status ?? "ok"})`,
);

try {
  const response: AgentResponseView = await client.agent.runData(target, {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Show me the top 3 stocks by closing price." },
        ],
      },
    ],
    stream: false,
  });

  // --- Passthrough getters ---
  console.log(`  role: ${response.role}`);
  console.log(`  content items: ${response.content.length}`);
  console.log(`  metadata.run_id: ${response.metadata?.run_id ?? "-"}`);
  console.log(
    `  responseBody.role: ${response.responseBody.role}   (escape hatch)`,
  );

  // --- Aggregate: concatenated text from all TextContentItem ---
  console.log(`  text: "${response.text}"`);

  // --- Typed content subsets (14 total) ---
  console.log(`  texts:               ${response.texts.length}`);
  for (const t of response.texts) console.log(`    [text] "${t.text}"`);

  console.log(`  thinkings:           ${response.thinkings.length}`);
  for (const th of response.thinkings)
    console.log(`    [thinking] ${th.thinking.text.trim().slice(0, 80)}`);

  console.log(`  toolUses:            ${response.toolUses.length}`);
  for (const tu of response.toolUses)
    console.log(
      `    [tool_use] ${tu.tool_use.name} input=${JSON.stringify(tu.tool_use.input)}`,
    );

  console.log(`  toolResults:         ${response.toolResults.length}`);
  for (const tr of response.toolResults)
    console.log(
      `    [tool_result] ${tr.tool_result.name} (${tr.tool_result.content?.length ?? 0} items)`,
    );

  console.log(
    `  toolResultsAggregated: ${response.toolResultsAggregated.length}`,
  );
  console.log(`  tables:              ${response.tables.length}`);
  console.log(`  charts:              ${response.charts.length}`);
  console.log(`  assets:              ${response.assets.length}`);
  console.log(`  suggestedQueries:    ${response.suggestedQueries.length}`);
  for (const sq of response.suggestedQueries) {
    for (const q of sq.suggested_queries)
      console.log(`    [suggested] ${q.query}`);
  }
  console.log(`  images:              ${response.images.length}`);
  console.log(`  documents:           ${response.documents.length}`);
  console.log(`  artifacts:           ${response.artifacts.length}`);
  console.log(`  permissionDecisions: ${response.permissionDecisions.length}`);
  console.log(`  actualUserMessages:  ${response.actualUserMessages.length}`);

  // --- Finder methods ---
  const anyToolUse = response.findToolUse();
  console.log(
    `  findToolUse():                 ${anyToolUse?.tool_use.name ?? "none"}`,
  );

  const analystCall = response.findToolUse("analyst");
  console.log(
    `  findToolUse("analyst"):        ${analystCall?.tool_use.tool_use_id ?? "none"}`,
  );

  const anyResult = response.findToolResult();
  console.log(
    `  findToolResult():              ${anyResult?.tool_result.name ?? "none"}`,
  );

  const sqlResult = response.findToolResult("system_execute_sql");
  console.log(
    `  findToolResult("...sql"):      ${sqlResult?.tool_result.status ?? "none"}`,
  );

  const sqlToolUses = response.getToolUsesByName("system_execute_sql");
  console.log(
    `  getToolUsesByName("...sql"):   ${sqlToolUses.length} match(es)`,
  );
} finally {
  const deleteResult: SuccessResponse = (
    await client.agent.delete(target, { ifExists: true })
  ).responseBody;
  console.log(`  deleted ${target.name} (${deleteResult?.status ?? "ok"})`);
}

// --- Example 4: Background run — kickoff returns an AsyncRun handle ---
// `{ stream: false, background: true }` returns an AsyncRun immediately; the
// server executes the run in the background and commits its reply to the
// thread when done. AsyncRun bundles the run_id with everything you'd do
// with it: .await() → final AgentResponseView, .cancel() → stop the run.
console.log("\n=== Background run (AsyncRun) ===");
const bgThread: ThreadMetadata = (
  await client.threads.create({ origin_application: "sdk-bg" })
).responseBody;
console.log(`  created thread: ${bgThread.thread_id}`);

try {
  const run: AsyncRun = await client.agent.run({
    models: { orchestration: "auto" },
    thread_id: bgThread.thread_id,
    parent_message_id: "0",
    background: true,
    stream: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "In one short sentence, what is Snowflake?" },
        ],
      },
    ],
  });

  console.log(`  status: ${run.initialStatus}`);
  console.log(`  run_id: ${run.runId}`);

  // Wait for the run and materialize its reply. This prefers the live stream
  // when available and otherwise polls the thread for the committed reply.
  const view: AgentResponseView = await run.result();
  // Exercise a range of AgentResponseView accessors to prove it's a full view.
  console.log(`  view.role:            ${view.role}`);
  console.log(`  view.text:            ${view.text.trim()}`);
  console.log(`  view.content.length:  ${view.content.length}`);
  console.log(`  view.texts.length:    ${view.texts.length}`);
  console.log(`  view.toolUses.length: ${view.toolUses.length}`);
  console.log(`  view.toolResults.len: ${view.toolResults.length}`);
  console.log(`  view.metadata.run_id: ${view.metadata?.run_id ?? "-"}`);
  console.log(
    `  view.events?.length:  ${view.events?.length ?? "(from thread, no events)"}`,
  );

  // Alternative lower-level access lives on `client.runs.*` for replay/cancel.
  let replayCount: number = 0;
  const replayKinds: Set<string> = new Set();
  for await (const ev of client.runs.stream(run.runId)) {
    replayCount++;
    replayKinds.add(ev.event);
  }
  console.log(
    `  runs.stream replay: ${replayCount} events, kinds=[${[...replayKinds].sort().join(", ")}]`,
  );
} finally {
  const del: SuccessResponse = (await client.threads.delete(bgThread.thread_id))
    .responseBody;
  console.log(
    `  deleted thread ${bgThread.thread_id} (${del?.status ?? "ok"})`,
  );
}
