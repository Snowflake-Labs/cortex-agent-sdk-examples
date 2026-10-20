/**
 * Threads CRUD: create a thread, run the agent inside it, list messages, delete.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/threads-crud.ts
 */
import {
  CortexAgentClient,
  EventType,
  ThreadMessageView,
  type ThreadMetadata,
  type DescribeThreadsResponse,
  type UpdateThreadRequest,
  type SearchThreadsResponse,
  type SuccessResponse,
  type ServerSentEvent,
  ThreadsPage,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
});

// 1. Create a thread
const thread: ThreadMetadata = (
  await client.threads.create({ origin_application: "external" })
).responseBody;
const threadId: string = thread.thread_id;
console.log("created thread", threadId);

// 2. Run the agent with thread_id — include analyst + cortex_search tools so
//    the persisted assistant turn contains a rich content mix (text, thinking,
//    tool_use, tool_result, table, suggested_queries) for ThreadMessageView
//    to introspect below.
const semanticView: string =
  process.env.SNOWFLAKE_SEMANTIC_VIEW!;
const searchService: string =
  process.env.SNOWFLAKE_SEARCH_SERVICE!;
const warehouse: string = process.env.SNOWFLAKE_WAREHOUSE ?? "COMPUTE_WH";

const stream: AsyncIterable<ServerSentEvent> = client.agent.run({
  thread_id: threadId,
  parent_message_id: "0",
  models: { orchestration: "auto" },
  instructions: {
    orchestration:
      "Use stocks_analyst for stock questions. Use wikipedia for general knowledge.",
    response: "Be concise.",
  },
  tools: [
    {
      tool_spec: {
        type: "cortex_analyst_text_to_sql",
        name: "stocks_analyst",
        description: "Query stock prices from STOCKS_DATA",
      },
    },
    {
      tool_spec: {
        type: "cortex_search",
        name: "wikipedia",
        description: "Search Wikipedia articles",
      },
    },
  ],
  tool_resources: {
    stocks_analyst: {
      semantic_view: semanticView,
      execution_environment: { type: "warehouse", warehouse },
    },
    wikipedia: { search_service: searchService, max_results: 3 },
  },
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: "What is the top stock by closing price?" },
      ],
    },
  ],
});
for await (const event of stream) {
  if (event.event === EventType.ResponseTextDelta) {
    process.stdout.write(event.text ?? "");
  } else if (event.event === EventType.Response) {
    process.stdout.write("\n");
  }
}

// 3. Describe the thread to see persisted messages.
//    `threads.messages()` is an alias for `describe()` — both hit the same
//    endpoint and return the same DescribeThreadsResponse.
const detail: DescribeThreadsResponse = (
  await client.threads.describe(threadId, { page_size: 20 })
).responseBody;
const detailViaAlias: DescribeThreadsResponse = (
  await client.threads.messages(threadId, {
    page_size: 20,
  })
).responseBody;
console.log(
  `\nthreads.describe returned ${detail.messages?.length ?? 0} msg(s), ` +
    `threads.messages returned ${detailViaAlias.messages?.length ?? 0} msg(s) (alias)`,
);
console.log(
  `thread ${threadId} has ${detail.messages?.length ?? 0} message(s)`,
);
for (const msg of detail.messages ?? []) {
  // ThreadMessageView parses `message_payload` and exposes the same typed
  // content accessors that AgentResponseView does — historical turns look
  // exactly like fresh responses.
  const view: ThreadMessageView = new ThreadMessageView(msg);
  console.log(`\n--- #${view.messageId} [${view.role}] ---`);
  console.log(`  text: "${view.text}"`);
  if (view.role === "assistant") {
    console.log(
      `  status=${view.status} schema=${view.schemaVersion} model=${(view.tags?.model as string) ?? "-"}`,
    );
  }
  console.log(`  content items: ${view.content.length}`);
  for (const t of view.texts)
    console.log(`  [text]\n${JSON.stringify(t, null, 2)}`);
  for (const t of view.thinkings)
    console.log(`  [thinking]\n${JSON.stringify(t, null, 2)}`);
  for (const tu of view.toolUses)
    console.log(`  [tool_use]\n${JSON.stringify(tu, null, 2)}`);
  for (const tr of view.toolResults)
    console.log(`  [tool_result]\n${JSON.stringify(tr, null, 2)}`);
  for (const tbl of view.tables)
    console.log(`  [table]\n${JSON.stringify(tbl, null, 2)}`);
  for (const sq of view.suggestedQueries)
    console.log(`  [suggested_queries]\n${JSON.stringify(sq, null, 2)}`);
}

// 4. Rename it
const updateBody: UpdateThreadRequest = {
  thread_name: "Data warehouse explainer",
};
const updateResult: SuccessResponse = (
  await client.threads.update(threadId, updateBody)
).responseBody;
console.log(`\nupdate status: ${updateResult?.status ?? "ok"}`);

// 5. Search across threads (fuzzy)
const searchResult: SearchThreadsResponse = (
  await client.threads.search({
    query: "data warehouse",
    limit: 5,
  })
).responseBody;
console.log(`search matched ${searchResult.threads?.length ?? 0} thread(s)`);

// 6. List threads and clean up
const listing: ThreadsPage<ThreadMetadata> = (
  await client.threads.list({ page_size: 5 })
).page;
console.log(`user has ${listing.data.length} thread(s) on first page`);
const deleteResult: SuccessResponse = (await client.threads.delete(threadId))
  .responseBody;
console.log(
  `deleted thread ${threadId} (status: ${deleteResult?.status ?? "ok"})`,
);
