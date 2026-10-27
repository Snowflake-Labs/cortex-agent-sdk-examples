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

import {
  CortexAgentClient,
  StreamEvent,
} from "@snowflake/cortex-agent-sdk/api";

export async function POST(req: Request) {
  const { question } = await req.json();
  if (!question) {
    return new Response("Missing question", { status: 400 });
  }

  const account = process.env.SNOWFLAKE_ACCOUNT;
  const pat = process.env.SNOWFLAKE_PAT;
  const semanticView = process.env.SNOWFLAKE_SEMANTIC_VIEW;
  const warehouse = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";

  if (!account || !pat || !semanticView) {
    return new Response(
      "Missing required env vars: SNOWFLAKE_ACCOUNT, SNOWFLAKE_PAT, SNOWFLAKE_SEMANTIC_VIEW",
      { status: 500 },
    );
  }

  const client = new CortexAgentClient({ account, auth: pat });

  const stream = client.agent.stream({
    models: { orchestration: "auto" },
    messages: [
      { role: "user", content: [{ type: "text", text: question }] },
    ],
    tools: [
      { tool_spec: { type: "cortex_analyst_text_to_sql", name: "analyst" } },
    ],
    tool_resources: {
      analyst: {
        semantic_view: semanticView,
        execution_environment: { type: "warehouse", warehouse },
      },
    },
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      stream.on(StreamEvent.Status, (ev) => {
        send({ type: "status", message: ev.message });
      });

      stream.on(StreamEvent.ToolResult, (ev) => {
        for (const item of ev.content ?? []) {
          if (item.type === "json") {
            const j = item.json as Record<string, unknown>;
            if (j.sql) {
              send({ type: "sql", sql: j.sql });
            }
            const table = toTable(j.result_set);
            if (table) {
              send({ type: "table", data: table });
            }
          }
        }
      });

      stream.on(StreamEvent.Text, (delta: string) => {
        send({ type: "text", text: delta });
      });

      stream.on(StreamEvent.Error, (err: Error) => {
        send({ type: "error", message: err.message });
      });

      try {
        await stream.done();
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Stream failed",
        });
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
    },
  });
}

/** Convert a SQL tool `result_set` into the `{ columns, rows }` shape the page renders. */
function toTable(
  resultSet: unknown,
): { columns: string[]; rows: Record<string, unknown>[] } | null {
  if (typeof resultSet !== "object" || resultSet === null) return null;
  const rs = resultSet as {
    data?: unknown[][];
    resultSetMetaData?: { rowType?: { name: string }[] };
  };
  const data = rs.data ?? [];
  const columns = (rs.resultSetMetaData?.rowType ?? []).map((c) => c.name);
  if (data.length === 0 || columns.length === 0) return null;
  const rows = data.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]])),
  );
  return { columns, rows };
}
