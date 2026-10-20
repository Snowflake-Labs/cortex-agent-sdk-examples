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
              thread: { origin_application: "app-builder-agent" },
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
        for await (const event of turn.events()) {
          if (event.event === "response.text.delta" && event.text) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "text", text: event.text }) + "\n",
              ),
            );
          }
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
