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
  account: process.env.SNOWFLAKE_ACCOUNT!,
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
