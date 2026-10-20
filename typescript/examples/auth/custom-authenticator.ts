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
