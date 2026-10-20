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

Be thorough but concise. If a category has no objects, note that. Return the complete report directly in your reply; do not write it to a file.`;

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
          ? await client.conversations.attach(threadId)
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

        const turn: Turn = await conversation.send(prompt, {
          agent: agentConfig,
        });

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
