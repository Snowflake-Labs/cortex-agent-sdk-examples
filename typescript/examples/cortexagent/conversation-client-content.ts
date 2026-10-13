/**
 * Sending client-supplied content through a durable conversation.
 *
 * Requires SNOWFLAKE_ACCOUNT + SNOWFLAKE_PAT, or a Snowflake connection profile
 * (CORTEX_EXAMPLE_CONNECTION defaults to default). Set
 * CORTEX_EXAMPLE_DOCUMENT_URL to a real @stage/path to also run the document section.
 */
import {
  CortexAgentClient,
  type AgentResponse,
  type Conversation,
  type ConversationInput,
  type Turn,
} from "@snowflake/cortex-agent-sdk";
import { connectFromProfile, endpoint } from "../_snowflake-session.js";
import type { Connection } from "snowflake-sdk";

const documentUrl: string | undefined = process.env.CORTEX_EXAMPLE_DOCUMENT_URL;
const account: string | undefined = process.env.SNOWFLAKE_ACCOUNT;
const auth: string | undefined = process.env.SNOWFLAKE_PAT;
let connection: Connection | undefined;
let client: CortexAgentClient;
if (account && auth) {
  client = new CortexAgentClient({ account, auth });
} else {
  const session = await connectFromProfile();
  connection = session.connection;
  client = new CortexAgentClient({
    ...endpoint(session.options),
    auth: session.auth,
  });
}
const conversation: Conversation = await client.conversations.create({
  thread: { origin_application: "cortex_agent_sdk" },
});

try {
  // A client-side tool loop can return a result from a previously requested
  // function. `tool_use_id` must be the ID from that tool-use request.
  const toolResult: ConversationInput = [
    {
      type: "tool_result",
      tool_result: {
        tool_use_id: "toolu_client_weather_001",
        name: "weather",
        status: "success",
        content: [
          { type: "json", json: { temperature_c: 21, condition: "clear" } },
          {
            type: "text",
            text: "San Francisco weather, supplied by the client.",
          },
        ],
      },
    },
    {
      type: "text",
      text: "Use the client tool result to give a one-sentence forecast.",
    },
  ];
  const toolTurn: Turn = await conversation.send(toolResult);
  const toolAnswer: AgentResponse = await toolTurn.result();
  console.log(`tool-result response: ${JSON.stringify(toolAnswer.text)}`);

  // Other supported client inputs use the same typed array: for example, an
  // inline image or a document already uploaded to a Snowflake stage.
  if (documentUrl) {
    if (!documentUrl.startsWith("@")) {
      throw new Error(
        "CORTEX_EXAMPLE_DOCUMENT_URL must be a Snowflake @stage/path.",
      );
    }
    const fileName: string = documentUrl.split("/").at(-1) || "document";
    const attachment: ConversationInput = [
      {
        type: "document",
        source: {
          file_name: fileName,
          url: documentUrl,
          media_type: "text/plain",
        },
      },
      { type: "text", text: "Summarize this document." },
    ];
    const attachmentTurn: Turn = await conversation.send(attachment);
    const attachmentAnswer: AgentResponse = await attachmentTurn.result();
    console.log(`document response: ${JSON.stringify(attachmentAnswer.text)}`);
  } else {
    console.log(
      "Skipped document input; set CORTEX_EXAMPLE_DOCUMENT_URL to run it.",
    );
  }
} finally {
  await conversation.delete();
  connection?.destroy(() => undefined);
}
