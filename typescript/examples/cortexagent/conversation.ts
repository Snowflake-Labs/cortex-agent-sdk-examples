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
 * High-level durable conversation example.
 *
 * Required environment variables:
 *   SNOWFLAKE_ACCOUNT
 *   SNOWFLAKE_PAT
 */
import {
  CortexAgentClient,
  type AgentResponse,
  type Conversation,
  type Turn,
} from "@snowflake/cortex-agent-sdk";

const account = process.env.SNOWFLAKE_ACCOUNT;
const auth = process.env.SNOWFLAKE_PAT;
if (!account || !auth) {
  throw new Error("Set SNOWFLAKE_ACCOUNT and SNOWFLAKE_PAT.");
}

const client: CortexAgentClient = new CortexAgentClient({ account, auth });

const conversation: Conversation = await client.conversations.create({
  thread: { origin_application: "sdk-examples" },
  agent: {
    type: "inline",
    spec: { models: { orchestration: "claude-sonnet-4-5" } },
  },
});

console.log(`conversation: ${conversation.id}`);

const first: Turn = await conversation.send("What is Snowflake Arctic?");
console.log(`run: ${first.id}`);

for await (const event of first.events()) {
  if (event.event === "response.text.delta")
    process.stdout.write(event.text ?? "");
}
console.log();

const firstAnswer: AgentResponse = await first.result();
console.log(`message: ${firstAnswer.messageId ?? "unknown"}`);

const followUp: Turn = await conversation.send("Summarize that in five words.");
const followUpAnswer: AgentResponse = await followUp.result();
console.log(followUpAnswer.text);

const attached: Conversation = await client.conversations.attach(
  conversation.id,
);
const finalTurn: Turn = await attached.send("What was my first question?", {
  agent: {
    type: "inline",
    spec: { models: { orchestration: "claude-sonnet-4-5" } },
  },
});
const finalAnswer: AgentResponse = await finalTurn.result();
console.log(finalAnswer.text);

await conversation.delete();
