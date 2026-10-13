"""Key-pair JWT authentication; the application owns signing and renewal."""

import os

from _run_conversation import run_conversation
from cortex_agent_sdk import CortexAgentClient, KeyPairJwtAuth


def mint_jwt() -> str:
    # Sign a short-lived JWT with your protected private key. The SDK does not sign it.
    return os.environ["SNOWFLAKE_KEYPAIR_JWT"]


client: CortexAgentClient = CortexAgentClient(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    base_url=os.environ.get("SNOWFLAKE_BASE_URL"),
    auth=KeyPairJwtAuth(mint_jwt),
    refresh_auth=lambda _context: None,
)
run_conversation(client)
client.close()
