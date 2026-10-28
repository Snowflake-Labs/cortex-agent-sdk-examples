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
 * Demonstrates tool use with the Cortex Analyst (text-to-SQL) tool.
 *
 * Shows two v2 paths:
 * 1. Lite agent with inline tool/tool_resources — configure the analyst tool per-request
 * 2. Named data agent — the analyst tool is baked into the agent definition
 *
 * Both emit the same v2 spec events (response.tool_use, response.tool_result, ...).
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/tool-use-analyst.ts
 */
import {
  CortexAgentClient,
  StreamEvent,
  AgentRunStream,
  type CortexAgentCreateRequest,
  type DataAgentTarget,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

const semanticView: string = process.env.SNOWFLAKE_SEMANTIC_VIEW!;
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";

// --- Example 1: Lite agent path with inline tool/tool_resources ---
console.log("=== Analyst tool — lite agent path (inline tool config) ===");
console.log(`  semantic_view: ${semanticView}\n`);

const stream: AgentRunStream = client.agent.stream({
  models: { orchestration: "auto" },
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What are the top 5 stocks by closing price?" },
      ],
    },
  ],
  tools: [
    { tool_spec: { type: "cortex_analyst_text_to_sql", name: "analyst" } },
  ],
  tool_resources: {
    analyst: {
      semantic_view: semanticView,
      // Required: without an execution environment the server rejects the tool
      // with 391920 ("missing an execution environment"), which arrives as an
      // error event rather than a thrown exception.
      execution_environment: { type: "warehouse", warehouse },
    },
  },
});

stream.on(StreamEvent.Status, (ev) => {
  console.log(`  [status] ${ev.status}: ${ev.message}`);
});

stream.on(StreamEvent.ToolUse, (ev) => {
  console.log(`  [toolUse] name=${ev.name} type=${ev.type}`);
  console.log(`    tool_use_id: ${ev.tool_use_id}`);
  const query = (ev.input as Record<string, unknown> | undefined)?.query;
  if (typeof query === "string") console.log(`    query: "${query}"`);
});

stream.on(StreamEvent.ToolResult, (ev) => {
  console.log(`  [toolResult] status=${ev.status} name=${ev.name}`);
  for (const item of ev.content ?? []) {
    if (item.type === "json") {
      const j = item.json as Record<string, unknown>;
      console.log(`    sql: ${j.sql}`);
      console.log(`    interpretation: ${j.text}`);
      console.log(`    verified_query: ${j.verified_query_used}`);
    }
  }
});

stream.on(StreamEvent.ToolResultStatus, (ev) => {
  console.log(
    `  [toolResultStatus] ${ev.status}: ${ev.message} (tool=${ev.tool_type})`,
  );
});

stream.on(StreamEvent.Text, (delta: string) => {
  process.stdout.write(delta);
});

stream.on(StreamEvent.Error, (err: Error) => {
  console.error(`  [error] ${err.message}`);
});

await stream.done();
console.log("\n");

// --- Example 2: Named agent path (tool baked into agent) ---
console.log("=== Analyst tool — named agent path ===");

const agent: DataAgentTarget = {
  database: process.env.SNOWFLAKE_DATABASE!,
  schema: process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC",
  name: process.env.SNOWFLAKE_AGENT ?? `SDK_ANALYST_EXAMPLE_${process.pid}`,
};
console.log(`  agent: ${agent.database}.${agent.schema}.${agent.name}\n`);

const agentSpec: CortexAgentCreateRequest = {
  name: agent.name,
  models: { orchestration: "auto" },
  instructions: {
    orchestration: "Use the analyst tool for stock questions.",
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
    { database: agent.database, schema: agent.schema },
    agentSpec,
    { createMode: "orReplace" },
  )
).responseBody;

try {
  const stream2: AgentRunStream = client.agent.streamData(agent, {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "What data can you analyze for me?" }],
      },
    ],
  });

  stream2.on(StreamEvent.Status, (ev) => {
    console.log(`  [status] ${ev.status}: ${ev.message}`);
  });

  stream2.on(StreamEvent.Thinking, (delta: string, accumulated: string) => {
    if (accumulated.length === delta.length)
      process.stdout.write("  [thinking] ");
    process.stdout.write(delta);
  });

  stream2.on(StreamEvent.ThinkingComplete, () => {
    console.log();
  });

  stream2.on(StreamEvent.ToolUse, (ev) => {
    console.log(
      `  [toolUse] name=${ev.name} type=${ev.type} id=${ev.tool_use_id}`,
    );
  });

  stream2.on(StreamEvent.ToolResultStatus, (ev) => {
    console.log(`  [toolResultStatus] ${ev.status}: ${ev.message}`);
  });

  stream2.on(StreamEvent.Text, (delta: string) => {
    process.stdout.write(delta);
  });

  stream2.on(StreamEvent.End, () => {
    console.log("\n  [end] stream completed");
  });

  await stream2.done();
  console.log("");
} finally {
  (await client.agent.delete(agent, { ifExists: true })).responseBody;
  console.log(`  Deleted agent ${agent.name}`);
}
