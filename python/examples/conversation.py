"""One thread alternating inline, data, and coding-agent turns."""

from __future__ import annotations

import os

from cortex_agent_sdk import AgentResponse, Conversation, CortexAgentClient, Turn

client: CortexAgentClient = CortexAgentClient(
    base_url=f"https://{os.environ['SNOWFLAKE_HOST']}" if os.getenv("SNOWFLAKE_HOST") else None,
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    auth=os.environ["SNOWFLAKE_PAT"],
)

conversation: Conversation = client.conversations.create(
    origin_application="sdk-examples",
    agent={"type": "inline", "spec": {"models": {"orchestration": "auto"}}},
)

inline_turn: Turn = conversation.send("What is Snowflake Arctic?")
inline_answer: AgentResponse = inline_turn.result()
print(inline_answer.text)

data_turn: Turn = conversation.send(
    "What is the highest closing price?",
    agent={
        "type": "data",
        "spec": {
            "database": os.getenv("SNOWFLAKE_DATABASE", "SNOWFLAKE_INTELLIGENCE"),
            "schema": os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
            "name": os.environ["SNOWFLAKE_DATA_AGENT"],
        },
    },
)
data_answer: AgentResponse = data_turn.result()
print(data_answer.text)

coding_turn: Turn = conversation.send(
    "Create a concise markdown summary.",
    agent={
        "type": "coding",
        "spec": {
            "models": {"orchestration": "claude-sonnet-4-5"},
            "permission_policy": "always_allow",
            "workspace_mounts": [{"name": "USER$MY_USER.PUBLIC.DEFAULT$"}],
        },
    },
)
coding_answer: AgentResponse = coding_turn.result()
print(coding_answer.text)

conversation.rename("SDK conversation example")
conversation.delete()
client.close()
