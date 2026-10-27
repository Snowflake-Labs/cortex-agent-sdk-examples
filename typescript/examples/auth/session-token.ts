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

/** Reuse the session token from an authenticated snowflake-sdk connection. */
import {
  CortexAgentClient,
  SnowflakeSessionTokenAuth,
} from "@snowflake/cortex-agent-sdk";
import { runConversation } from "./run-conversation.js";
import {
  connect as connectSnowflake,
  endpoint,
  loadConnectionProfile,
  sessionToken,
} from "../_snowflake-session.js";
import type { Connection, ConnectionOptions } from "snowflake-sdk";

const options: ConnectionOptions =
  process.env.SNOWFLAKE_ACCOUNT &&
  process.env.SNOWFLAKE_USER &&
  process.env.SNOWFLAKE_PASSWORD
    ? {
        account: process.env.SNOWFLAKE_ACCOUNT,
        username: process.env.SNOWFLAKE_USER,
        password: process.env.SNOWFLAKE_PASSWORD,
      }
    : loadConnectionProfile();

async function connect(): Promise<Connection> {
  return connectSnowflake(options);
}

let connection: Connection = await connect();

const client: CortexAgentClient = new CortexAgentClient({
  ...endpoint(options),
  // The callback is evaluated for every request, so it observes a refreshed token.
  auth: new SnowflakeSessionTokenAuth(() => sessionToken(connection)),
  // Replace an expired driver session after an authentication failure.
  refreshAuth: async () => {
    const previous: Connection = connection;
    connection = await connect();
    previous.destroy(() => undefined);
  },
});

try {
  await runConversation(client);
} finally {
  connection.destroy(() => undefined);
}
