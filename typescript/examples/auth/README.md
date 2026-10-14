# Authentication examples

Each file shows one supported way to configure `CortexAgentClient`.
Authentication code belongs in trusted server-side code; never ship a PAT,
private key, refresh token, or Snowflake session token to a browser.

Run examples from the repository root:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/auth/pat.ts
```

| Example | Use when |
| --- | --- |
| `pat.ts` | Your service has a Programmatic Access Token. |
| `oauth.ts` | Your service receives OAuth access tokens and refreshes them. |
| `session-token.ts` | You already have an authenticated `snowflake-sdk` connection. |
| `key-pair-jwt.ts` | A server-to-server service signs short-lived key-pair JWTs. |
| `custom-authenticator.ts` | Your credential source needs a custom header implementation. |

`oauth-setup.sql` is optional Snowflake setup for the OAuth example. Review and
adapt it before running it in your account.

Every example constructs a client and runs a minimal conversation through
`run-conversation.js`. See `../cortexagent/` for fuller conversation examples.
