/**
 * Demonstrates ALL StreamEvent callbacks available on AgentRunStream.
 *
 * Uses a named data agent so every v2 event type has a chance to fire
 * (response.status, response.thinking.delta, response.tool_use,
 * response.tool_result.status, etc.).
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/all-events.ts
 */
import {
  CortexAgentClient,
  StreamEvent,
  EventType,
  AgentRunStream,
  type DataAgentTarget,
  type CortexAgentCreateRequest,
  type SuccessResponse,
  type StatusEvent,
  type TextEvent,
  type ThinkingEvent,
  type ToolUseEvent,
  type ToolUseStatusEvent,
  type ToolResultEvent,
  type ToolResultStatusEvent,
  type SummarizationEvent,
  type TableEvent,
  type ChartEvent,
  type AssetEvent,
  type WarningEvent,
  type ResponseTextAnnotationEvent,
  type SubagentEvent,
  type IOGuardrailsEvent,
  type SuggestedQueriesEvent,
  type ExecutionTraceEvent,
  type MetadataEvent,
  type ResponseEvent,
  type TextDeltaEvent,
  type ThinkingDeltaEvent,
  type AnalystToolResultDeltaEvent,
  type SqlExplanationToolResultDeltaEvent,
  type DebugDeltaEvent,
  type ErrorEvent,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  ...(process.env.SNOWFLAKE_HOST
    ? { baseUrl: `https://${process.env.SNOWFLAKE_HOST}` }
    : { account: process.env.SNOWFLAKE_ACCOUNT! }),
  auth: process.env.SNOWFLAKE_PAT!,
});

// Create an agent bound to a semantic view so runs actually exercise tool_use,
// tool_result, analyst deltas, and table events — not just text/thinking.
const agent: DataAgentTarget = {
  database: process.env.SNOWFLAKE_DATABASE ?? "SNOWFLAKE_INTELLIGENCE",
  schema: process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC",
  name: `SDK_ALL_EVENTS_EXAMPLE_${process.pid}`,
};
const semanticView: string =
  process.env.SNOWFLAKE_SEMANTIC_VIEW ??
  "SNOWFLAKE_INTELLIGENCE.PUBLIC.STOCKS_DATA";
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";

const agentSpec: CortexAgentCreateRequest = {
  name: agent.name,
  models: { orchestration: "auto" },
  instructions: {
    orchestration: "Use the analyst tool for questions about stocks.",
    response: "Be concise, answer with 1-2 sentences.",
  },
  tools: [
    {
      tool_spec: {
        type: "cortex_analyst_text_to_sql",
        name: "analyst",
        description: "Query stock data",
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
    { database: agent.database, schema: agent.schema },
    agentSpec,
    {
      createMode: "orReplace",
    },
  )
).responseBody;
console.log(
  `Created agent ${agent.database}.${agent.schema}.${agent.name} (${createResult?.status ?? "ok"})\n`,
);

// --- Example 1: All callbacks with a data agent (spec events) ---
console.log("=== All StreamEvent callbacks (data agent / spec events) ===");
console.log(`  agent: ${agent.database}.${agent.schema}.${agent.name}\n`);

const stream: AgentRunStream = client.agent.streamData(agent, {
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Show me the top 5 stocks by closing price." },
      ],
    },
  ],
});

stream
  .on(StreamEvent.Status, (ev: StatusEvent) => {
    console.log(`  [status] ${ev.status}: ${ev.message}`);
  })
  .on(StreamEvent.Thinking, (delta: string, accumulated: string) => {
    if (accumulated.length === delta.length)
      process.stdout.write("  [thinking] ");
    process.stdout.write(delta);
  })
  .on(StreamEvent.ThinkingComplete, (ev: ThinkingEvent) => {
    console.log(`\n  [thinking complete] (${ev.text.length} chars)`);
  })
  .on(StreamEvent.Text, (delta: string) => {
    process.stdout.write(delta);
  })
  .on(StreamEvent.TextComplete, (ev: TextEvent) => {
    console.log(`\n  [text complete] (${ev.text.length} chars)`);
  })
  .on(StreamEvent.ToolUse, (ev: ToolUseEvent) => {
    console.log(
      `  [toolUse] name=${ev.name} type=${ev.type} id=${ev.tool_use_id}`,
    );
  })
  .on(StreamEvent.ToolUseStatus, (ev: ToolUseStatusEvent) => {
    console.log(`  [toolUseStatus] ${ev.status}: ${ev.message}`);
  })
  .on(StreamEvent.ToolResult, (ev: ToolResultEvent) => {
    console.log(`  [toolResult] status=${ev.status} name=${ev.name}`);
  })
  .on(StreamEvent.ToolResultStatus, (ev: ToolResultStatusEvent) => {
    console.log(
      `  [toolResultStatus] ${ev.status}: ${ev.message} (tool=${ev.tool_type})`,
    );
  })
  .on(StreamEvent.AnalystDelta, (delta: string) => {
    process.stdout.write(delta);
  })
  .on(StreamEvent.SqlExplanationDelta, (delta: string) => {
    process.stdout.write(delta);
  })
  .on(StreamEvent.Summarization, (ev: SummarizationEvent) => {
    console.log(`  [summarization] ${ev.summary}`);
  })
  .on(StreamEvent.Table, (ev: TableEvent) => {
    console.log(
      `  [table] tool_use_id=${ev.tool_use_id} query_id=${ev.query_id}`,
    );
  })
  .on(StreamEvent.Chart, (ev: ChartEvent) => {
    console.log(`  [chart] tool_use_id=${ev.tool_use_id}`);
  })
  .on(StreamEvent.Asset, (ev: AssetEvent) => {
    console.log(
      `  [asset] path=${ev.path} description=${ev.description ?? "(none)"}`,
    );
  })
  .on(StreamEvent.Warning, (ev: WarningEvent) => {
    console.log(`  [warning] ${ev.message}`);
  })
  .on(StreamEvent.Annotation, (ev: ResponseTextAnnotationEvent) => {
    console.log(
      `  [annotation] index=${ev.annotation_index} ${JSON.stringify(ev.annotation)}`,
    );
  })
  .on(StreamEvent.Subagent, (ev: SubagentEvent) => {
    console.log(`  [subagent] subagent_id=${ev.subagent_id}`);
  })
  .on(StreamEvent.Guardrails, (ev: IOGuardrailsEvent) => {
    console.log(`  [guardrails] risk=${ev.risk} message=${ev.message}`);
  })
  .on(StreamEvent.SuggestedQueries, (ev: SuggestedQueriesEvent) => {
    console.log(
      `  [suggestedQueries] count=${ev.suggested_queries?.length ?? 0}`,
    );
  })
  .on(StreamEvent.ExecutionTrace, (ev: ExecutionTraceEvent) => {
    console.log(`  [executionTrace] spans=${ev.traces?.length ?? 0}`);
  })
  .on(StreamEvent.Debug, (delta: string) => {
    process.stderr.write(`  [debug] ${delta}\n`);
  })
  .on(StreamEvent.Metadata, (ev: MetadataEvent) => {
    console.log(
      `  [metadata] run_id=${ev.metadata?.run_id} role=${ev.metadata?.role}`,
    );
  })
  .on(StreamEvent.Error, (err: Error) => {
    console.error(`  [error] ${err.message}`);
  })
  .on(StreamEvent.End, (ev: ResponseEvent) => {
    console.log(`  [end] stream completed (status=${ev.status ?? "-"})`);
  });

await stream.done();

console.log("\n  --- Accumulated state ---");
console.log(`  currentText:     ${stream.currentText.length} chars`);
console.log(`  currentThinking: ${stream.currentThinking.length} chars`);
console.log(`  currentAnalyst:  ${stream.currentAnalyst.length} chars`);

// --- Example 2: for-await with EventType — narrows the ServerSentEvent union
// to specific delta/error event types that .on() surfaces as strings (delta) or
// JS Errors, not their raw SSE shape. ---
console.log("\n\n=== Raw event log (for-await, narrowed) ===");

const stream2: AgentRunStream = client.agent.streamData(agent, {
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What are the top 3 stocks by closing price?" },
      ],
    },
  ],
});

const eventCounts: Record<string, number> = {};
let textChars: number = 0;
let thinkingChars: number = 0;
let analystChars: number = 0;
let sqlExplanationChars: number = 0;
let debugChars: number = 0;
for await (const event of stream2) {
  eventCounts[event.event] = (eventCounts[event.event] ?? 0) + 1;
  switch (event.event) {
    case EventType.ResponseTextDelta: {
      const ev: TextDeltaEvent = event;
      textChars += (ev.text ?? "").length;
      break;
    }
    case EventType.ResponseThinkingDelta: {
      const ev: ThinkingDeltaEvent = event;
      thinkingChars += (ev.text ?? "").length;
      break;
    }
    case EventType.ResponseToolResultAnalystDelta: {
      const ev: AnalystToolResultDeltaEvent = event;
      analystChars += (ev.delta.text ?? "").length;
      break;
    }
    case EventType.ResponseToolResultSqlExplanationDelta: {
      const ev: SqlExplanationToolResultDeltaEvent = event;
      sqlExplanationChars += ev.delta.text.length;
      break;
    }
    case EventType.DebugDelta: {
      const ev: DebugDeltaEvent = event;
      const text = (ev.text as string | undefined) ?? "";
      debugChars += text.length;
      break;
    }
    case EventType.Error: {
      const ev: ErrorEvent = event;
      console.error(`\n  [error frame] code=${ev.code} message=${ev.message}`);
      break;
    }
  }
}

console.log(
  `  Streamed chars: text=${textChars} thinking=${thinkingChars} analyst=${analystChars} sqlExplanation=${sqlExplanationChars} debug=${debugChars}`,
);

console.log("\n  Event type counts:");
for (const [type, count] of Object.entries(eventCounts).sort(
  (a, b) => b[1] - a[1],
)) {
  console.log(`    ${type}: ${count}`);
}

// Clean up
const deleteResult: SuccessResponse = (
  await client.agent.delete(agent, { ifExists: true })
).responseBody;
console.log(`\nDeleted agent ${agent.name} (${deleteResult?.status ?? "ok"})`);
