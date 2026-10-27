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
  type Conversation,
  type Turn,
} from "@snowflake/cortex-agent-sdk";

export const maxDuration = 300;

const agentConfig = {
  type: "coding" as const,
  spec: {
    permissionPolicy: "always_allow" as const,
    models: { orchestration: "claude-sonnet-4-5" },
    // Without this the agent sometimes writes code/reports to sandbox files
    // and replies with no text, leaving the user with an empty answer.
    instructions: {
      system:
        "Put your complete answer, including any code or report, directly in your reply. " +
        "Do not write files unless the user explicitly asks for one.",
    },
  },
};

export async function POST(req: Request): Promise<Response> {
  const { message, threadId } = (await req.json()) as {
    message: string;
    threadId?: string;
  };

  const account = process.env.SNOWFLAKE_ACCOUNT;
  const auth = process.env.SNOWFLAKE_PAT;

  if (!account || !auth) {
    return new Response("Missing SNOWFLAKE_ACCOUNT or SNOWFLAKE_PAT env vars", {
      status: 500,
    });
  }

  const client = new CortexAgentClient({ account, auth });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const conversation: Conversation = threadId
          ? await client.conversations.attach(threadId)
          : await client.conversations.create({
              thread: { origin_application: "app-builder" },
              agent: agentConfig,
            });

        // Send the thread ID so the client can track it for multi-turn
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "threadId",
              threadId: conversation.id,
            }) + "\n",
          ),
        );

        const turn: Turn = await conversation.send(message, {
          agent: agentConfig,
        });

        // Stream events as they arrive
        // Only forward answer deltas; thinking deltas and the final aggregated
        // response.text event also carry a `text` field and would duplicate output.
        // A new content_index means a new text block; separate blocks so the
        // agent's narration between tool calls doesn't run together.
        let lastIndex: number | undefined;
        let streamed = false;
        for await (const event of turn.events()) {
          if (event.event === "response.text.delta" && event.text) {
            const sep =
              streamed && event.content_index !== lastIndex
                ? "\n\n"
                : "";
            lastIndex = event.content_index;
            streamed = true;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "text", text: sep + event.text }) + "\n",
              ),
            );
          }
        }

        // Defensive: if nothing streamed, send whatever the completed result holds.
        if (!streamed) {
          const { text } = await turn.result();
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "text", text }) + "\n"),
          );
        }

        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "done" }) + "\n"),
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown error occurred";
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "text", text: `\n\nError: ${msg}` }) + "\n",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
