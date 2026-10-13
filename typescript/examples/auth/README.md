# Authentication examples

Each file shows one supported way to configure `CortexAgentClient`. Authentication
code belongs in trusted server-side code; never ship a PAT, private key, refresh
token, or Snowflake session token to a browser.

| Example | Use when |
| --- | --- |
| `pat.ts` | Your service has a Programmatic Access Token. |
| `oauth.ts` | Your service receives OAuth access tokens and refreshes them. |
| `session-token.ts` | You already have an authenticated `snowflake-sdk` connection. |
| `key-pair-jwt.ts` | A server-to-server service signs short-lived key-pair JWTs. |
| `custom-authenticator.ts` | Your credential source needs a custom header implementation. |

Every example constructs a client. Use that client with the conversation API, for
example `await client.conversations.create(...)`. See `examples/cortexagent/` for
complete request examples.
