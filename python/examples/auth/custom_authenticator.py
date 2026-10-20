"""An application-specific authentication-header provider."""

import os

from _run_conversation import run_conversation
from cortex_agent_sdk import CortexAgentClient


class SecretStorePatAuth:
    def get_auth_headers(self) -> dict[str, str]:
        # Replace with a secret-manager lookup. Called before every request attempt.
        token = os.environ["SNOWFLAKE_PAT"]
        return {
            "Authorization": f"Bearer {token}",
            "X-Snowflake-Authorization-Token-Type": "PROGRAMMATIC_ACCESS_TOKEN",
        }


client: CortexAgentClient = CortexAgentClient(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    base_url=os.environ.get("SNOWFLAKE_BASE_URL"),
    auth=SecretStorePatAuth(),
)
run_conversation(client)
client.close()
