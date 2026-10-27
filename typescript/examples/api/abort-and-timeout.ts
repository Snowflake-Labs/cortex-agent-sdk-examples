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
 * Demonstrates abort and timeout patterns.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/abort-and-timeout.ts
 */
import {
  CortexAgentClient,
  StreamEvent,
  AgentRunStream,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
  timeoutMs: 30_000,
});

const body = {
  models: { orchestration: "auto" },
  messages: [
    {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: "Write a 500 word essay about databases.",
        },
      ],
    },
  ],
};

// --- Example 1: AbortController ---
console.log("=== AbortController (abort after 2s) ===");
const controller: AbortController = new AbortController();
setTimeout(() => controller.abort(), 2000);

const stream1: AgentRunStream = client.agent.stream(body, {
  signal: controller.signal,
});
stream1.on(StreamEvent.Text, (delta: string) => process.stdout.write(delta));
try {
  await stream1.done();
} catch (err) {
  const name = err instanceof Error ? err.name : "Error";
  console.log(`\n[Aborted: ${name}]`);
}

// --- Example 2: AgentRunStream.abort() ---
// Note: some servers deliver the full response in a single SSE event (legacy format),
// so the first delta may already exceed the limit. We cap stdout to show the intent.
console.log("\n\n=== AgentRunStream.abort() (abort after 50 chars) ===");
let printed: number = 0;
const stream2: AgentRunStream = client.agent.stream(body);
stream2.on(StreamEvent.Text, (_delta: string, accumulated: string) => {
  const remaining: number = 50 - printed;
  if (remaining > 0) {
    const slice: string = _delta.slice(0, remaining);
    process.stdout.write(slice);
    printed += slice.length;
  }
  if (accumulated.length > 50) stream2.abort();
});
try {
  await stream2.done();
} catch {
  console.log("\n[Stream aborted via .abort()]");
}

// --- Example 3: Per-request timeout ---
console.log("\n\n=== Per-request timeout (100ms — will likely fail) ===");
try {
  await client.agent.run({ ...body, stream: false as const }, { timeout: 100 });
} catch (err) {
  if (err instanceof Error)
    console.log(`[Timeout error: ${err.name} — ${err.message}]`);
  else console.log(`[Timeout error: ${String(err)}]`);
}
