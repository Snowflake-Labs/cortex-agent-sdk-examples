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

function buildProfilingPrompt(table: string): string {
  return `You are a data profiling expert. Profile the Snowflake table **${table}** and produce a comprehensive quality report. Run the SQL queries needed and present the results in well-formatted markdown tables.

Perform these analyses in order:

1. **Schema Overview** — List every column with its data type, nullable flag, and a brief description inferred from the name. Present as a markdown table.

2. **Row Count & Freshness** — Total row count. If there is a timestamp or date column, report the min, max, and how recently data was added.

3. **Null Analysis** — For each column, count the number of NULLs and compute the null percentage. Flag columns with >5% nulls. Present as a markdown table.

4. **Cardinality** — For each column, report the count of distinct values and the cardinality ratio (distinct / total). Identify potential primary keys (cardinality ratio = 1.0) and low-cardinality columns suitable for filtering. Present as a markdown table.

5. **Numeric Statistics** — For every numeric column, compute: min, max, mean, median, standard deviation, and count of zeros. Flag potential outliers (values beyond 3 standard deviations). Present as a markdown table.

6. **String Column Analysis** — For string columns, report: min length, max length, average length, and count of empty strings. Present as a markdown table.

7. **Top Values** — For low-cardinality columns (< 20 distinct values), list the top 10 values with their counts and percentages.

8. **Data Quality Summary** — Summarize findings: overall quality score (Good / Fair / Poor), key issues found, and actionable recommendations.

Use clear section headings and markdown tables throughout. Be thorough but concise.`;
}

export async function POST(req: Request): Promise<Response> {
  const { table, message, threadId } = (await req.json()) as {
    table?: string;
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

  const prompt = message ?? (table ? buildProfilingPrompt(table) : null);
  if (!prompt) {
    return new Response("Provide a table name or message", { status: 400 });
  }

  const client = new CortexAgentClient({ account, auth });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const conversation: Conversation = threadId
          ? await client.conversations.attach(threadId)
          : await client.conversations.create({
              thread: { origin_application: "automated-data-profiler" },
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
