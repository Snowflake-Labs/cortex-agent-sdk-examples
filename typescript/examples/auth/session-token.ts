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
