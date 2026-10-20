"""Error handling with status-specific exception subclasses.

Usage:
    SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... python examples/error_handling.py
"""

from __future__ import annotations

import os

from cortex_agent_sdk import (
    AuthenticationError,
    BadRequestError,
    CortexAgentAPIError,
    NotFoundError,
    RateLimitError,
)
from cortex_agent_sdk.api import CortexAgentClient

account = os.getenv("SNOWFLAKE_ACCOUNT")

client = CortexAgentClient(
    account=account,
    auth=os.environ["SNOWFLAKE_PAT"],
    max_retries=2,
)

# --- Example 1: Catch specific error types ---
print("=== NotFoundError (describe nonexistent thread) ===")
try:
    client.threads.describe(999999999)
except NotFoundError as err:
    print(f"  Caught NotFoundError: {err}")
    print(f"  Status: {err.status}")
    print(f"  Request ID: {err.request_id or '(none)'}")
except CortexAgentAPIError as err:
    print(f"  API error {err.status}: {err}")

# --- Example 2: request_with_response for the request ID on success ---
# request_with_response is the low-level escape hatch: it hands back the parsed
# body *and* the httpx.Response, which is the only way to read a response header
# on a successful call. `request_id` is what feedback.send() wants.
print("\n=== request_with_response (get the request ID on success) ===")
try:
    result = client.request_with_response("GET", "/api/v2/cortex/threads", params={"page_size": 3})
    print(f"  Request ID:   {result.request_id}")
    print(f"  HTTP status:  {result.response.status_code}")
    print(f"  Threads read: {len(result.response_body)}")
except CortexAgentAPIError as err:
    print(f"  Error (request_id={err.request_id}): {err}")

# --- Example 3: Callable auth (token refresh) ---
print("\n=== Callable auth (simulated token rotation) ===")
call_count = 0


def mint_token() -> str:
    global call_count
    call_count += 1
    print(f"  [auth] get_token called (call #{call_count})")
    return os.environ["SNOWFLAKE_PAT"]


rotating_client = CortexAgentClient(account=account, auth=mint_token)
rotating_client.threads.list(page_size=1)
print("  Listed threads with callable auth")

# --- Example 4: The exception hierarchy ---
print("\n=== Error hierarchy ===")
for err in (
    BadRequestError(400, "req-1", {"message": "missing field"}),
    AuthenticationError(401, "req-2", {"message": "invalid token"}),
    NotFoundError(404, "req-3", {"message": "thread not found"}),
    RateLimitError(429, "req-4", {"message": "too many requests"}),
):
    print(f"  {type(err).__name__} (status={err.status}): {err}")
    print(f"    isinstance of CortexAgentAPIError: {isinstance(err, CortexAgentAPIError)}")
