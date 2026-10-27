<!--
Copyright 2026 Snowflake Inc.
SPDX-License-Identifier: Apache-2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

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
