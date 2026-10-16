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

const AUDIT_PROMPT = (database: string) =>
  `You are a Snowflake pipeline auditor. Audit the database "${database}" by doing the following:

1. **Dynamic Tables**: Run \`SHOW DYNAMIC TABLES IN DATABASE ${database};\` and check their refresh status. Report any that are in FAILED or SUSPENDED state. For each, note the name, schema, target lag, and last refresh time.

2. **Tasks**: Run \`SHOW TASKS IN DATABASE ${database};\` and check for tasks that are suspended, have recent failures, or haven't run in over 24 hours. Report name, schema, schedule, state, and last run time.

3. **Streams**: Run \`SHOW STREAMS IN DATABASE ${database};\` and identify stale streams (stale_after approaching or past). Report name, schema, source object, type, and stale status.

4. **Pipes**: Run \`SHOW PIPES IN DATABASE ${database};\` and check for any that are paused or have recent errors. Report name, schema, status, and definition.

Format each section as a **markdown table** with a clear header. After the tables, provide a **Summary** section with:
- Total counts of each object type
- Number of healthy vs unhealthy objects
- Top recommendations for fixing issues

Be thorough but concise. If a category has no objects, note that.`;

export async function POST(req: Request): Promise<Response> {
  const { database, message, threadId } = (await req.json()) as {
    database: string;
    message?: string;
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
  const prompt = message ?? AUDIT_PROMPT(database);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const conversation: Conversation = threadId
          ? await client.conversations.attach({ threadId, agent: agentConfig })
          : await client.conversations.create({
              thread: { origin_application: "pipeline-auditor" },
              agent: agentConfig,
            });

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "threadId",
              threadId: conversation.id,
            }) + "\n",
          ),
        );

        const turn: Turn = await conversation.send(prompt);

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

function extractText(event: unknown): string {
  if (typeof event !== "object" || event === null) return "";
  const e = event as Record<string, unknown>;

  if (e.event === "text" && typeof e.data === "object" && e.data !== null) {
    const data = e.data as Record<string, unknown>;
    if (typeof data.delta === "object" && data.delta !== null) {
      const delta = data.delta as Record<string, unknown>;
      if (typeof delta.value === "string") return delta.value;
    }
    if (typeof data.text === "string") return data.text;
  }

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

  if (typeof e.text === "string") return e.text;

  if (typeof e.delta === "string") return e.delta;
  if (typeof e.delta === "object" && e.delta !== null) {
    const delta = e.delta as Record<string, unknown>;
    if (typeof delta.value === "string") return delta.value;
    if (typeof delta.text === "string") return delta.text;
  }

  return "";
}
