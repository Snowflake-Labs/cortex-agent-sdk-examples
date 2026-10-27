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
 * Managed coding-agent permission policies.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/coding-agent-permissions.ts
 *   CORTEX_EXAMPLE_CONNECTION=default npx tsx examples/api/coding-agent-permissions.ts
 *
 * For regional, PrivateLink, custom, or proxy endpoints, set
 * SNOWFLAKE_BASE_URL instead of SNOWFLAKE_ACCOUNT.
 *
 * `always_allow` auto-approves tool operations that would otherwise require
 * approval. Use it only with trusted inputs and scoped workspace/access.
 * `always_ask` lets an application surface the tool request and send a
 * permission_decision in a follow-up request after approval.
 */
import {
  CortexAgentClient,
  type AgentResponseView,
  type AgentRunStream,
  type AsyncRun,
  type ServerSentEvent,
} from "@snowflake/cortex-agent-sdk/api";
import { SnowflakeSessionTokenAuth } from "@snowflake/cortex-agent-sdk";
import {
  connectFromProfile,
  endpoint,
  sessionToken,
} from "../_snowflake-session.js";
import type { Connection } from "snowflake-sdk";

let connection: Connection | undefined;
let profileEndpoint: { baseUrl: string } | { account: string } | undefined;

if (!process.env.SNOWFLAKE_PAT) {
  const session = await connectFromProfile();
  connection = session.connection;
  profileEndpoint = endpoint(session.options);
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

const prompt =
  "Run this exact bash command and report the stdout: " +
  "rm -rf /tmp/cortex-agent-sdk-permission-example-does-not-exist && echo permission-example-ok";

function permissionOptions(event: ServerSentEvent): string[] {
  const permission = (event as { permission?: { options?: unknown } })
    .permission;
  return Array.isArray(permission?.options)
    ? permission.options.filter(
        (option): option is string => typeof option === "string",
      )
    : [];
}

function toolUseId(event: ServerSentEvent): string {
  const id = (event as { tool_use_id?: unknown }).tool_use_id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Permission event did not include tool_use_id.");
  }
  return id;
}

try {
  const allowStream: AgentRunStream = client.codingAgent.stream({
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    permissionPolicy: "always_allow",
    models: { orchestration: "claude-sonnet-4-5" },
  });

  let allowSawPermission = false;
  let allowSawClientToolUseRequest = false;
  for await (const event of allowStream) {
    if (event.event === "response.tool_use" && "permission" in event) {
      allowSawPermission = true;
    }
    if (
      event.event === "response.status" &&
      event.status === "client_tool_use_request"
    ) {
      allowSawClientToolUseRequest = true;
    }
  }

  console.log("always_allow result");
  console.log(`  text: ${allowStream.currentText.trim()}`);
  console.log(`  request_id: ${allowStream.requestId}`);
  console.log(`  emitted tool permission: ${allowSawPermission}`);
  console.log(
    `  emitted client_tool_use_request status: ${allowSawClientToolUseRequest}`,
  );

  const thread = await client.threads.create({});
  const threadId = String(thread.responseBody.thread_id);
  const askRun: AsyncRun = await client.codingAgent.run({
    thread_id: threadId,
    parent_message_id: "0",
    messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    permissionPolicy: "always_ask",
    models: { orchestration: "claude-sonnet-4-5" },
    stream: false,
    background: true,
  });

  let permissionEvent: ServerSentEvent | undefined;
  let askSawClientToolUseRequest = false;
  for await (const event of askRun.events()) {
    if (event.event === "response.tool_use" && "permission" in event) {
      permissionEvent = event;
    }
    if (
      event.event === "response.status" &&
      event.status === "client_tool_use_request"
    ) {
      askSawClientToolUseRequest = true;
    }
  }
  const askResponse: AgentResponseView = await askRun.result();

  console.log("always_ask result");
  console.log(`  first_request_id: ${askRun.requestId}`);
  console.log(`  emitted tool permission: ${permissionEvent !== undefined}`);
  console.log(
    `  emitted client_tool_use_request status: ${askSawClientToolUseRequest}`,
  );

  if (!permissionEvent) {
    throw new Error("Expected always_ask to emit a permission request.");
  }
  const decision = "Allow this command";
  const options = permissionOptions(permissionEvent);
  if (!options.includes(decision)) {
    throw new Error(
      `Expected permission options to include ${JSON.stringify(decision)}.`,
    );
  }
  const parentMessageId = askResponse.messageId;
  if (!parentMessageId) {
    throw new Error(
      "Permission response did not include an assistant message id.",
    );
  }

  console.log(`  permission options: ${JSON.stringify(options)}`);
  console.log(`  selected decision: ${decision}`);

  const followUpRun: AsyncRun = await client.codingAgent.run({
    thread_id: threadId,
    parent_message_id: parentMessageId,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "permission_decision",
            permission_decision: {
              tool_use_id: toolUseId(permissionEvent),
              decision,
            },
          },
        ],
      },
    ],
    permissionPolicy: "always_ask",
    models: { orchestration: "claude-sonnet-4-5" },
    stream: false,
    background: true,
  });
  const followUpResponse = await followUpRun.result();
  console.log(`  follow_up_request_id: ${followUpRun.requestId}`);
  console.log(`  continued text: ${followUpResponse.text.trim()}`);
} finally {
  connection?.destroy(() => undefined);
}
