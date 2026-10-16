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
          ? await client.conversations.attach({ threadId, agent: agentConfig })
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

        const turn: Turn = await conversation.send(message);

        // Stream events as they arrive
        for await (const event of turn.events()) {
          const text = extractText(event);
          if (text) {
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "text", text }) + "\n"),
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

/**
 * Extract text content from a streaming event. The SDK's Turn.events()
 * yields objects whose shape depends on the event type — text deltas
 * carry the displayable content we want to forward to the client.
 */
function extractText(event: unknown): string {
  if (typeof event !== "object" || event === null) return "";
  const e = event as Record<string, unknown>;

  // Shape 1: { event: "text", data: { delta: { value: "..." } } }
  if (e.event === "text" && typeof e.data === "object" && e.data !== null) {
    const data = e.data as Record<string, unknown>;
    if (typeof data.delta === "object" && data.delta !== null) {
      const delta = data.delta as Record<string, unknown>;
      if (typeof delta.value === "string") return delta.value;
    }
    if (typeof data.text === "string") return data.text;
  }

  // Shape 2: { event: "text", data: "<json string>" }
  if (e.event === "text" && typeof e.data === "string") {
    try {
      const parsed = JSON.parse(e.data) as Record<string, unknown>;
      if (typeof parsed.delta === "object" && parsed.delta !== null) {
        const delta = parsed.delta as Record<string, unknown>;
        if (typeof delta.value === "string") return delta.value;
      }
      if (typeof parsed.text === "string") return parsed.text;
    } catch {
      return e.data;
    }
  }

  // Shape 3: direct text property
  if (typeof e.text === "string") return e.text;

  // Shape 4: delta at top level
  if (typeof e.delta === "string") return e.delta;
  if (typeof e.delta === "object" && e.delta !== null) {
    const delta = e.delta as Record<string, unknown>;
    if (typeof delta.value === "string") return delta.value;
    if (typeof delta.text === "string") return delta.text;
  }

  return "";
}
