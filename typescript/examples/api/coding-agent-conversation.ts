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
 * Coding Agent conversation.
 *
 * Uses a Snowflake connection profile solely to obtain a session token; agent
 * execution uses the public conversation API and a managed coding agent.
 *
 * Requires a profile in ~/.snowflake/connections.toml. The default is
 * `default`.
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=default npx tsx examples/api/coding-agent-conversation.ts
 */
import {
  CortexAgentClient,
  type AgentResponse,
  type Conversation,
  type Turn,
} from "@snowflake/cortex-agent-sdk";
import { connectFromProfile, endpoint } from "../_snowflake-session.js";

const { connection, options, auth } = await connectFromProfile();

try {
  const client: CortexAgentClient = new CortexAgentClient({
    ...endpoint(options),
    auth,
  });
  const conversation: Conversation = await client.conversations.create({
    thread: { origin_application: "cortex_agent_sdk" },
    agent: {
      type: "coding",
      spec: {
        permissionPolicy: "always_allow",
        models: { orchestration: "claude-sonnet-4-5" },
      },
    },
  });
  console.log(`conversation: ${conversation.id}`);

  // Send a message, then consume the durable turn's typed Agent API events.
  const first: Turn = await conversation.send(
    "Reply with exactly: CODING_AGENT_FIRST_OK",
  );
  let eventCount = 0;
  for await (const _event of first.events()) eventCount += 1;
  const firstResponse: AgentResponse = await first.result();
  console.log(
    `first: ${firstResponse.text.trim()} (${eventCount} events; run ${first.id})`,
  );

  // Attach selects the latest assistant reply as the parent for the next message.
  const attached: Conversation = await client.conversations.attach(
    conversation.id,
  );
  const attachedTurn: Turn = await attached.send(
    "Reply with exactly: CODING_AGENT_ATTACH_OK",
    {
      agent: { type: "coding", spec: { permissionPolicy: "always_allow" } },
    },
  );
  console.log(`attached: ${(await attachedTurn.result()).text.trim()}`);

  // A branch is an explicit local conversation handle over the same thread;
  // its next send uses the chosen assistant message ID.
  const messageId = firstResponse.messageId;
  if (!messageId)
    throw new Error("The first response did not include a message id.");
  const branch: Conversation = conversation.branch(messageId);
  const branchTurn: Turn = await branch.send(
    "Reply with exactly: CODING_AGENT_BRANCH_OK",
  );
  console.log(`branch: ${(await branchTurn.result()).text.trim()}`);

  // Replay the durable turn's Agent API event stream from the beginning.
  let replayedEvents = 0;
  for await (const _event of first.events({ startingAfter: 0 }))
    replayedEvents += 1;
  console.log(`replayed ${replayedEvents} events for run ${first.id}`);

  await conversation.delete();
} finally {
  connection.destroy(() => undefined);
}
