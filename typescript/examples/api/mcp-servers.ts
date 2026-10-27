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
 * Attach Snowflake MCP SERVER objects to lite `agent:run` and data-agent specs.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/mcp-servers.ts
 *   CORTEX_EXAMPLE_CONNECTION=default npx tsx examples/api/mcp-servers.ts
 *
 * For regional, PrivateLink, custom, or proxy endpoints, set
 * SNOWFLAKE_BASE_URL instead of SNOWFLAKE_ACCOUNT.
 *
 * This uses a SQL MCP SERVER with SYSTEM_EXECUTE_SQL (no OAuth). Override
 * with SNOWFLAKE_MCP_SERVER (FQN). The example creates
 * CORTEX_AGENT_SDK_EXAMPLES.PUBLIC.SDK_SQL_EXEC_MCP when missing if a Snowflake
 * SQL connection is available (profile path).
 */
import {
  CortexAgentClient,
  type AgentRunStream,
  type ServerSentEvent,
} from "@snowflake/cortex-agent-sdk/api";
import { SnowflakeSessionTokenAuth } from "@snowflake/cortex-agent-sdk";
import {
  connectFromProfile,
  endpoint,
  sessionToken,
} from "../_snowflake-session.js";
import type { Connection } from "snowflake-sdk";

const mcpServerFqn: string =
  process.env.SNOWFLAKE_MCP_SERVER ??
  "CORTEX_AGENT_SDK_EXAMPLES.PUBLIC.SDK_SQL_EXEC_MCP";
const agentDb: string =
  process.env.SNOWFLAKE_DATABASE ?? "CORTEX_AGENT_SDK_EXAMPLES";
const agentSchema: string = process.env.SNOWFLAKE_SCHEMA ?? "PUBLIC";
const agentName: string = `SDK_MCP_EXAMPLE_AGENT_${process.pid}`;

let connection: Connection | undefined;
let profileEndpoint: { baseUrl: string } | { account: string } | undefined;

if (!process.env.SNOWFLAKE_PAT) {
  const session = await connectFromProfile();
  connection = session.connection;
  profileEndpoint = endpoint(session.options);
}

function executeSql(sqlText: string): Promise<Record<string, unknown>[]> {
  if (!connection)
    throw new Error("No Snowflake connection is available for SQL.");
  return new Promise((resolve, reject) => {
    connection!.execute({
      sqlText,
      complete: (err, _stmt, rows) => {
        if (err) reject(err);
        else resolve((rows as Record<string, unknown>[] | undefined) ?? []);
      },
    });
  });
}

async function ensureExampleMcpServer(): Promise<void> {
  if (!connection) return;
  await executeSql("CREATE DATABASE IF NOT EXISTS CORTEX_AGENT_SDK_EXAMPLES");
  await executeSql(
    "CREATE SCHEMA IF NOT EXISTS CORTEX_AGENT_SDK_EXAMPLES.PUBLIC",
  );
  await executeSql(`
CREATE OR REPLACE MCP SERVER CORTEX_AGENT_SDK_EXAMPLES.PUBLIC.SDK_SQL_EXEC_MCP
FROM SPECIFICATION $$
tools:
  - name: sql_exec_tool
    title: SQL Execution Tool
    description: Execute a single SQL query and return results.
    type: SYSTEM_EXECUTE_SQL
$$`);
}

const client: CortexAgentClient = new CortexAgentClient(
  process.env.SNOWFLAKE_PAT
    ? {
        ...(process.env.SNOWFLAKE_BASE_URL
          ? { baseUrl: process.env.SNOWFLAKE_BASE_URL }
          : { account: process.env.SNOWFLAKE_ACCOUNT! }),
        auth: process.env.SNOWFLAKE_PAT,
      }
    : {
        ...profileEndpoint!,
        auth: new SnowflakeSessionTokenAuth(() => sessionToken(connection!)),
      },
);

function collectText(events: ServerSentEvent[]): string {
  return events
    .filter((e) => e.event === "response.text")
    .map((e) => String((e as { text?: unknown }).text ?? ""))
    .join("");
}

function toolNames(events: ServerSentEvent[]): string[] {
  const names: string[] = [];
  for (const e of events) {
    if (e.event !== "response.tool_use") continue;
    const name = (e as { name?: unknown }).name;
    if (typeof name === "string") names.push(name);
  }
  return names;
}

try {
  if (connection) await ensureExampleMcpServer();

  console.log("lite_agent_run_with_mcp_servers");
  console.log(`  mcp_server: ${mcpServerFqn}`);

  const liteStream: AgentRunStream = client.agent.stream({
    models: { orchestration: "claude-sonnet-4-5" },
    instructions: {
      orchestration:
        "Use the MCP SQL tool to answer. Prefer SELECT CURRENT_USER() AS u, CURRENT_ROLE() AS r.",
      response: "Be concise. Quote the SQL result.",
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Using the attached MCP SQL tool, run SELECT CURRENT_USER() AS u, CURRENT_ROLE() AS r and report the result.",
          },
        ],
      },
    ],
    mcp_servers: [{ server_spec: { name: mcpServerFqn } }],
  });

  const liteEvents: ServerSentEvent[] = [];
  for await (const event of liteStream) liteEvents.push(event);
  const liteTools = toolNames(liteEvents);
  console.log(`  request_id: ${liteStream.requestId}`);
  console.log(`  tool_uses: ${JSON.stringify(liteTools)}`);
  console.log(`  used_mcp_tool: ${liteTools.some((n) => /sql|mcp/i.test(n))}`);
  console.log(`  text: ${collectText(liteEvents).trim().slice(0, 500)}`);

  console.log("data_agent_create_with_mcp_servers");
  console.log(`  agent: ${agentDb}.${agentSchema}.${agentName}`);

  await client.agent.create(
    { database: agentDb, schema: agentSchema },
    {
      name: agentName,
      models: { orchestration: "claude-sonnet-4-5" },
      instructions: {
        orchestration:
          "Use the MCP SQL tool when the user asks for the current user/role.",
        response: "Be concise.",
      },
      mcp_servers: [{ server_spec: { name: mcpServerFqn } }],
    },
    { createMode: "orReplace" },
  );

  const dataStream: AgentRunStream = client.agent.streamData(
    { database: agentDb, schema: agentSchema, name: agentName },
    {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Using your MCP SQL tool, run SELECT CURRENT_USER() AS u and report the value.",
            },
          ],
        },
      ],
    },
  );
  const dataEvents: ServerSentEvent[] = [];
  for await (const event of dataStream) dataEvents.push(event);
  const dataTools = toolNames(dataEvents);
  console.log(`  request_id: ${dataStream.requestId}`);
  console.log(`  tool_uses: ${JSON.stringify(dataTools)}`);
  console.log(`  used_mcp_tool: ${dataTools.some((n) => /sql|mcp/i.test(n))}`);
  console.log(`  text: ${collectText(dataEvents).trim().slice(0, 500)}`);

  await client.agent.delete({
    database: agentDb,
    schema: agentSchema,
    name: agentName,
  });
  console.log("cleanup");
  console.log(`  deleted_agent: ${agentDb}.${agentSchema}.${agentName}`);
} finally {
  if (connection) {
    await new Promise<void>((resolve) => connection!.destroy(() => resolve()));
  }
}
