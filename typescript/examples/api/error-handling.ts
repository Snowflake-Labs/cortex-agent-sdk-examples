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
 * Demonstrates error handling with status-specific subclasses.
 *
 * Usage:
 *   SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npx tsx examples/api/error-handling.ts
 */
import {
  CortexAgentClient,
  CortexAgentAPIError,
  NotFoundError,
  RateLimitError,
  AuthenticationError,
  BadRequestError,
} from "@snowflake/cortex-agent-sdk/api";

const client: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: process.env.SNOWFLAKE_PAT!,
  retryPolicy: { maxRetries: 2 },
});

// --- Example 1: Catch specific error types ---
console.log("=== NotFoundError (describe nonexistent thread) ===");
try {
  (await client.threads.describe(999999999)).responseBody;
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log(`  Caught NotFoundError: ${err.message}`);
    console.log(`  Status: ${err.status}`);
    console.log(`  Request ID: ${err.requestId ?? "(none)"}`);
  } else if (err instanceof CortexAgentAPIError) {
    console.log(`  API error ${err.status}: ${err.message}`);
  }
}

// --- Example 2: requestWithResponse for request ID on success ---
console.log("\n=== requestWithResponse (get request ID on success) ===");
try {
  const { responseBody, requestId } = await client.requestWithResponse<unknown>(
    "/api/v2/cortex/threads",
    {
      method: "GET",
    },
  );
  console.log(`  Request ID: ${requestId}`);
  console.log(`  Response body: ${JSON.stringify(responseBody)}`);
} catch (err) {
  if (err instanceof CortexAgentAPIError) {
    console.log(`  Error (request_id=${err.requestId}): ${err.message}`);
  }
}

// --- Example 3: Callable auth (token refresh) ---
console.log("\n=== Callable auth (simulated token rotation) ===");
let callCount = 0;
const rotatingClient: CortexAgentClient = new CortexAgentClient({
  account: process.env.SNOWFLAKE_ACCOUNT!,
  auth: () => {
    callCount++;
    console.log(`  [auth] getToken called (call #${callCount})`);
    return process.env.SNOWFLAKE_PAT!;
  },
});
await rotatingClient.threads.list({ page_size: 1 });
console.log("  Listed threads with callable auth");

// --- Example 4: Custom retry handling for rate limits ---
console.log("\n=== Error hierarchy ===");
const errors = [
  new BadRequestError(400, "req-1", { message: "missing field" }),
  new AuthenticationError(401, "req-2", { message: "invalid token" }),
  new NotFoundError(404, "req-3", { message: "thread not found" }),
  new RateLimitError(429, "req-4", { message: "too many requests" }),
];
for (const e of errors) {
  console.log(`  ${e.name} (status=${e.status}): ${e.message}`);
  console.log(
    `    instanceof CortexAgentAPIError: ${e instanceof CortexAgentAPIError}`,
  );
}
