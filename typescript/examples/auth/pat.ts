/** Programmatic Access Token (PAT) authentication. */
import { CortexAgentClient, PatAuth } from "@snowflake/cortex-agent-sdk";
import { runConversation } from "./run-conversation.js";

const account: string = process.env.SNOWFLAKE_ACCOUNT!;
const pat: string = process.env.SNOWFLAKE_PAT!;

// `auth: pat` is equivalent. Use PatAuth when making the credential explicit.
const client: CortexAgentClient = new CortexAgentClient({
  ...(process.env.SNOWFLAKE_BASE_URL
    ? { baseUrl: process.env.SNOWFLAKE_BASE_URL }
    : { account }),
  auth: new PatAuth(pat),
});

await runConversation(client);
