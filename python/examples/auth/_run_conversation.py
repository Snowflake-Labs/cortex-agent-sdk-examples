"""Shared minimal Agent API verification used by the authentication examples."""

from cortex_agent_sdk import AgentResponse, Conversation, CortexAgentClient, Turn


def run_conversation(client: CortexAgentClient) -> None:
    conversation: Conversation = client.conversations.create(
        origin_application="cortex_agent_sdk",
        agent={"type": "inline", "spec": {"models": {"orchestration": "auto"}}},
    )
    try:
        turn: Turn = conversation.send("Reply with exactly: authentication succeeded")
        response: AgentResponse = turn.result()
        print(f"conversation={conversation.id}")
        print(f"run={turn.id}")
        print(f"response={response.text!r}")
    finally:
        conversation.delete()
