/**
 * Demonstrates auto-pagination with ThreadsPage.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/pagination.ts
 */
import {
  CortexAgentClient,
  ThreadsPage,
  type ThreadMetadata,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  ...(process.env.SNOWFLAKE_HOST
    ? { baseUrl: `https://${process.env.SNOWFLAKE_HOST}` }
    : { account: process.env.SNOWFLAKE_ACCOUNT! }),
  auth: process.env.SNOWFLAKE_PAT!,
});

// --- Example 1: Auto-pagination (for-await iterates all pages) ---
console.log("=== Auto-pagination (page_size=3) ===");
let count: number = 0;
const page: ThreadsPage<ThreadMetadata> = (
  await client.threads.list({ page_size: 3 })
).page;
for await (const thread of page) {
  console.log(
    `  thread_id=${thread.thread_id} name="${thread.thread_name ?? "(untitled)"}"`,
  );
  count++;
  if (count >= 10) break;
}
console.log(`  (iterated ${count} threads)`);

// --- Example 2: Manual pagination ---
console.log("\n=== Manual pagination ===");
let currentPage: ThreadsPage<ThreadMetadata> = (
  await client.threads.list({ page_size: 2 })
).page;
let pageNum: number = 1;
while (true) {
  console.log(`  Page ${pageNum}: ${currentPage.data.length} threads`);
  for (const t of currentPage.data) {
    console.log(`    thread_id=${t.thread_id}`);
  }
  if (!currentPage.hasMore) break;
  if (pageNum >= 3) {
    console.log("  (stopping at page 3 for demo)");
    break;
  }
  currentPage = (await currentPage.getNextPage()).page;
  pageNum++;
}

// --- Example 3: First page only (.data property) ---
console.log("\n=== First page only (.data property) ===");
const firstPage: ThreadsPage<ThreadMetadata> = (
  await client.threads.list({ page_size: 5 })
).page;
console.log(`  Got ${firstPage.data.length} threads on first page`);
console.log(`  hasMore: ${firstPage.hasMore}`);
