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

import type { CortexAgentClient } from "@snowflake/cortex-agent-sdk";

/** Runs a minimal conversation to verify an authenticator against the Agent API. */
export async function runConversation(
  client: CortexAgentClient,
): Promise<void> {
  const conversation = await client.conversations.create({
    thread: { origin_application: "cortex_agent_sdk" },
    agent: { type: "inline", spec: { models: { orchestration: "auto" } } },
  });
  try {
    const turn = await conversation.send(
      "Reply with exactly: authentication succeeded",
    );
    const response = await turn.result();
    console.log(`conversation=${conversation.id}`);
    console.log(`run=${turn.id}`);
    console.log(`response=${JSON.stringify(response.text)}`);
  } finally {
    await conversation.delete();
  }
}
