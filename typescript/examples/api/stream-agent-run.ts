/**
 * Stream a lite agent run via the **raw for-await iterator** (as opposed to
 * `AgentRunStream`'s callback API). The prompt configures inline tools
 * (analyst + cortex_search) so most event types actually fire — text,
 * thinking, tool_use, tool_result, table, suggested_queries, status,
 * metadata, response.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/stream-agent-run.ts
 */
import {
  CortexAgentClient,
  EventType,
  type ServerSentEvent,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

const semanticView: string =
  process.env.SNOWFLAKE_SEMANTIC_VIEW!;
const searchService: string =
  process.env.SNOWFLAKE_SEARCH_SERVICE!;
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";

const stream: AsyncIterable<ServerSentEvent> = client.agent.run({
  models: { orchestration: "auto" },
  instructions: {
    orchestration:
      "Use analyst for stock questions, wikipedia for general knowledge.",
    response: "Be concise.",
  },
  tools: [
    {
      tool_spec: {
        type: "cortex_analyst_text_to_sql",
        name: "analyst",
        description: "Query stock prices from STOCKS_DATA",
      },
    },
    {
      tool_spec: {
        type: "cortex_search",
        name: "wikipedia",
        description: "Search Wikipedia articles",
      },
    },
  ],
  tool_resources: {
    analyst: {
      semantic_view: semanticView,
      execution_environment: { type: "warehouse", warehouse },
    },
    wikipedia: { search_service: searchService, max_results: 3 },
  },
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "Show me the top 3 stocks by closing price." },
      ],
    },
  ],
});

for await (const event of stream) {
  switch (event.event) {
    case EventType.ResponseTextDelta:
      process.stdout.write(event.text ?? "");
      break;
    case EventType.ResponseText:
      console.log(`\n[text] complete (${event.text.length} chars)`);
      break;
    case EventType.ResponseThinkingDelta:
      // Suppress thinking chunks in stdout; log the aggregated block at completion.
      break;
    case EventType.ResponseThinking:
      console.log(
        `[thinking] ${event.text.slice(0, 80)}${event.text.length > 80 ? "..." : ""}`,
      );
      break;
    case EventType.ResponseToolUse:
      console.log(`[tool_use] name=${event.name} type=${event.type}`);
      break;
    case EventType.ResponseToolResult:
      console.log(`[tool_result] name=${event.name} status=${event.status}`);
      break;
    case EventType.ResponseTable:
      console.log(
        `[table] query_id=${event.query_id} tool_use_id=${event.tool_use_id}`,
      );
      break;
    case EventType.ResponseSuggestedQueries:
      console.log(
        `[suggested_queries] ${event.suggested_queries?.length ?? 0} follow-ups`,
      );
      break;
    case EventType.ResponseStatus:
      console.log(`[status] ${event.status}: ${event.message}`);
      break;
    case EventType.Metadata:
      console.log(
        `[metadata] role=${event.metadata?.role} run_id=${event.metadata?.run_id ?? "-"}`,
      );
      break;
    case EventType.Error:
      throw new Error(`Agent error: ${JSON.stringify(event)}`);
    case EventType.Response:
      process.stdout.write("\n");
      console.log(`[response] status=${event.status ?? "-"}`);
      break;
  }
}
