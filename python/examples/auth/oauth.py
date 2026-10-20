"""Run against the local default OAuth setup:

SNOWFLAKE_ACCOUNT=myaccount \
SNOWFLAKE_BASE_URL=https://myaccount.snowflakecomputing.com \
SNOWFLAKE_OAUTH_TOKEN_ENDPOINT=https://myaccount.snowflakecomputing.com/oauth/token-request \
SNOWFLAKE_OAUTH_CLIENT_ID=<oauth-client-id> \
SNOWFLAKE_OAUTH_CLIENT_SECRET=<oauth-client-secret> \
SNOWFLAKE_OAUTH_REFRESH_TOKEN=<oauth-refresh-token> \
uv run python examples/auth/oauth.py

Optionally set SNOWFLAKE_OAUTH_ACCESS_TOKEN and SNOWFLAKE_OAUTH_EXPIRES_AT
(seconds since epoch) when restoring a persisted access-token cache.

Where the values come from:
- Create the OAuth security integration (see the TypeScript example's
  oauth-setup.sql), then run DESCRIBE SECURITY INTEGRATION <name> to read
  OAUTH_CLIENT_ID.
- Run SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('<name>') to retrieve its
  generated client secret. Store that value in a server-side secret manager.
- Start a one-time authorization-code login at the integration's
  OAUTH_AUTHORIZATION_ENDPOINT. Exchange its callback code at
  OAUTH_TOKEN_ENDPOINT with the client ID/secret; the response contains the
  refresh token. Persist that refresh token in the same secret manager.

Long-running server OAuth authentication with proactive and reactive refresh.
"""

import base64
import json
import os
import time
from typing import TypedDict
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from _run_conversation import run_conversation
from cortex_agent_sdk import CortexAgentClient, OAuthAuth
from typing_extensions import NotRequired


class OAuthTokenResponse(TypedDict):
    access_token: str
    expires_in: int
    refresh_token: NotRequired[str]


token_endpoint: str = os.environ["SNOWFLAKE_OAUTH_TOKEN_ENDPOINT"]
client_id: str = os.environ["SNOWFLAKE_OAUTH_CLIENT_ID"]
client_secret: str = os.environ["SNOWFLAKE_OAUTH_CLIENT_SECRET"]
access_token: str | None = os.environ.get("SNOWFLAKE_OAUTH_ACCESS_TOKEN")
refresh_token: str | None = os.environ.get("SNOWFLAKE_OAUTH_REFRESH_TOKEN")
expires_at: float = float(os.environ.get("SNOWFLAKE_OAUTH_EXPIRES_AT", "0"))


def refresh_access_token() -> None:
    """Exchange an encrypted refresh token with Snowflake OAuth or your IdP."""
    global access_token, refresh_token, expires_at
    if refresh_token is None:
        raise RuntimeError("No OAuth refresh token is available.")

    basic_auth: str = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    request = Request(
        token_endpoint,
        data=urlencode({"grant_type": "refresh_token", "refresh_token": refresh_token}).encode(),
        headers={
            "Authorization": f"Basic {basic_auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urlopen(request) as response:  # noqa: S310 - endpoint is application configuration
        payload: OAuthTokenResponse = json.load(response)
    access_token = payload["access_token"]
    # OAuth providers can rotate this value; persist it in the app's encrypted token store.
    refresh_token = payload.get("refresh_token", refresh_token)
    expires_at = time.time() + payload["expires_in"]


def get_valid_access_token() -> str:
    # Refresh early so a request does not begin with a nearly expired token.
    if access_token is None or time.time() >= expires_at - 120:
        refresh_access_token()
    assert access_token is not None
    return access_token


client: CortexAgentClient = CortexAgentClient(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    base_url=os.environ.get("SNOWFLAKE_BASE_URL"),
    auth=OAuthAuth(get_valid_access_token),
    refresh_auth=refresh_access_token,
)
run_conversation(client)
client.close()
