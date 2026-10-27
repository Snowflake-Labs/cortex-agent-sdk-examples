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

/** Custom authentication headers for an application-specific credential source. */
import {
  CortexAgentClient,
  type Authenticator,
} from "@snowflake/cortex-agent-sdk";
import { runConversation } from "./run-conversation.js";

class SecretStorePatAuth implements Authenticator {
  async getAuthHeaders(): Promise<Record<string, string>> {
    // Replace with a secret manager lookup. This executes before every request.
    const token: string = process.env.SNOWFLAKE_PAT!;
    return {
      Authorization: `Bearer ${token}`,
      "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
    };
  }
}

const client: CortexAgentClient = new CortexAgentClient({
  ...(process.env.SNOWFLAKE_BASE_URL
    ? { baseUrl: process.env.SNOWFLAKE_BASE_URL }
    : { account: process.env.SNOWFLAKE_ACCOUNT! }),
  auth: new SecretStorePatAuth(),
});

await runConversation(client);
