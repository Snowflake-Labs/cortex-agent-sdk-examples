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
 * Rich lite-agent streaming example — an inline agent spec (analyst + cortex_search
 * tools) run through `client.agent.stream()`.
 *
 * A "lite" agent = same shape as a saved data agent, except the agent spec
 * (models, instructions, tools, tool_resources) lives inline in the request
 * body instead of being registered ahead of time via `agent.create()`. Everything
 * else — endpoint semantics, event stream, response shape — is identical.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/lite-agent-streaming.ts
 */
import {
  CortexAgentClient,
  StreamEvent,
  AgentRunStream,
  type StatusEvent,
  type TextEvent,
  type ThinkingEvent,
  type ToolUseEvent,
  type ToolUseStatusEvent,
  type ToolResultEvent,
  type ToolResultStatusEvent,
  type TableEvent,
  type SuggestedQueriesEvent,
  type MetadataEvent,
  type ResponseEvent,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

const semanticView: string = process.env.SNOWFLAKE_SEMANTIC_VIEW!;
const searchService: string = process.env.SNOWFLAKE_SEARCH_SERVICE!;
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";

console.log("=== Lite agent with inline tools (analyst + cortex_search) ===");
console.log(`  semantic_view:  ${semanticView}`);
console.log(`  search_service: ${searchService}\n`);

const stream: AgentRunStream = client.agent.stream({
  models: { orchestration: "auto" },
  instructions: {
    orchestration:
      "Use the stocks_analyst tool for stock-price questions. Use wikipedia for general knowledge lookups.",
    response: "Be concise. Cite which tool produced each fact.",
  },
  tools: [
    {
      tool_spec: {
        type: "cortex_analyst_text_to_sql",
        name: "stocks_analyst",
        description:
          "Query stock prices/symbols from the STOCKS_DATA semantic view",
      },
    },
    {
      tool_spec: {
        type: "cortex_search",
        name: "wikipedia",
        description: "Search Wikipedia for general knowledge topics",
      },
    },
  ],
  tool_resources: {
    stocks_analyst: {
      semantic_view: semanticView,
      execution_environment: { type: "warehouse", warehouse },
    },
    wikipedia: { search_service: searchService, max_results: 3 },
  },
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Find the top 3 stocks by closing price, then search Wikipedia for a one-sentence summary of the highest-priced stock's company.",
        },
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
    console.log(`    input=${JSON.stringify(ev.input)}`);
  })
  .on(StreamEvent.ToolUseStatus, (ev: ToolUseStatusEvent) => {
    console.log(`  [toolUseStatus] ${ev.status}: ${ev.message}`);
  })
  .on(StreamEvent.ToolResult, (ev: ToolResultEvent) => {
    console.log(
      `  [toolResult] status=${ev.status} name=${ev.name} (${ev.content?.length ?? 0} content item(s))`,
    );
  })
  .on(StreamEvent.ToolResultStatus, (ev: ToolResultStatusEvent) => {
    console.log(
      `  [toolResultStatus] ${ev.status}: ${ev.message} (tool=${ev.tool_type})`,
    );
  })
  .on(StreamEvent.Table, (ev: TableEvent) => {
    console.log(
      `  [table] tool_use_id=${ev.tool_use_id} query_id=${ev.query_id}`,
    );
  })
  .on(StreamEvent.SuggestedQueries, (ev: SuggestedQueriesEvent) => {
    console.log(
      `  [suggestedQueries] ${ev.suggested_queries?.length ?? 0} follow-up(s)`,
    );
    for (const q of ev.suggested_queries ?? []) console.log(`    - ${q.query}`);
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

const finalText: string = await stream.finalText();
console.log(`\n=== Final answer (${finalText.length} chars) ===`);
console.log(finalText);
