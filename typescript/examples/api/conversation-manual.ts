/**
 * Multi-turn conversation using the **low-level** APIs directly — no
 * `Conversation` abstraction. The client:
 *   1. creates a thread via `client.threads.create`
 *   2. runs each turn with explicit `thread_id` + `parent_message_id`
 *   3. captures the assistant's `message_id` from the metadata event on the
 *      stream, feeds it back as the next turn's `parent_message_id`
 *   4. lists messages, then deletes the thread
 *
 * This is the plumbing that `Conversation` (see `conversation.ts`) hides.
 * Reach for this pattern when you need to construct request bodies by hand,
 * mix threading with unusual body fields, or if you're integrating with
 * existing code that already tracks these IDs.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/conversation-manual.ts
 */
import {
  AgentRunStream,
  CortexAgentClient,
  StreamEvent,
  type DescribeThreadsResponse,
  type SuccessResponse,
  type ThreadMetadata,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  ...(process.env.SNOWFLAKE_HOST
    ? { baseUrl: `https://${process.env.SNOWFLAKE_HOST}` }
    : { account: process.env.SNOWFLAKE_ACCOUNT! }),
  auth: process.env.SNOWFLAKE_PAT!,
});

// --- 1. Create a thread ---
const thread: ThreadMetadata = (
  await client.threads.create({
    origin_application: "sdk-examples",
  })
).responseBody;
console.log(`Created thread: ${thread.thread_id}`);

// --- 2. First turn: parent_message_id = "0" for the very first message ---
const stream1: AgentRunStream = client.agent.stream({
  models: { orchestration: "auto" },
  thread_id: thread.thread_id,
  parent_message_id: "0",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "What is Snowflake Arctic?" }],
    },
  ],
});

// The assistant's message_id arrives on a `metadata` event — capture it so we
// can pass it as `parent_message_id` on the next turn.
let assistantMessageId: string | undefined;
stream1.on(StreamEvent.Metadata, (ev) => {
  if (
    ev.metadata?.role === "assistant" &&
    typeof ev.metadata.message_id === "string"
  ) {
    assistantMessageId = ev.metadata.message_id;
  }
});

const firstReply: string = await stream1.finalText();
console.log(
  `\nTurn 1:\n${firstReply.slice(0, 200)}${firstReply.length > 200 ? "..." : ""}`,
);
console.log(`\nCaptured assistant message ID: ${assistantMessageId}`);

// --- 3. Follow-up: pass the captured message id as parent_message_id ---
const stream2: AgentRunStream = client.agent.stream({
  models: { orchestration: "auto" },
  thread_id: thread.thread_id,
  parent_message_id: assistantMessageId,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "In one sentence, name one advantage over Llama 3.",
        },
      ],
    },
  ],
});
const followUp: string = await stream2.finalText();
console.log(`\nTurn 2:\n${followUp}`);

// --- 4. List the persisted messages ---
const detail: DescribeThreadsResponse = (
  await client.threads.describe(thread.thread_id, {
    page_size: 20,
  })
).responseBody;
console.log(`\nThread now has ${detail.messages?.length ?? 0} messages`);

// --- 5. Clean up ---
const deleteResult: SuccessResponse = (
  await client.threads.delete(thread.thread_id)
).responseBody;
console.log(`Thread deleted (status: ${deleteResult?.status ?? "ok"})`);
