import type { CortexAgentClient } from "@snowflake/cortex-agent-sdk";

/** Runs a minimal conversation to verify an authenticator against the Agent API. */
export async function runConversation(client: CortexAgentClient): Promise<void> {
  const conversation = await client.conversations.create({
    thread: { origin_application: "cortex_agent_sdk" },
    agent: { type: "inline", spec: { models: { orchestration: "auto" } } },
  });
  try {
    const turn = await conversation.send("Reply with exactly: authentication succeeded");
    const response = await turn.result();
    console.log(`conversation=${conversation.id}`);
    console.log(`run=${turn.id}`);
    console.log(`response=${JSON.stringify(response.text)}`);
  } finally {
    await conversation.delete();
  }
}
