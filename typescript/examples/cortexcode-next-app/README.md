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

# CodingAgent Browser Demo

Minimal Next.js app that proves `@snowflake/cortex-agent-sdk` CodingAgent
conversations work in a real browser bundle against a live Snowflake backend.

The browser client imports the public SDK root. Paste `restUrl` and a token
directly into the page, then let the browser call the real Agent API over HTTPS.
Use this only for local testing; do not build production browser flows that ask
users to paste long-lived credentials into a page.

## Run

```bash
cd typescript/examples/cortexcode-next-app
npm install
npm run dev
```

Open `http://localhost:3000`, click **Run live browser demo**, and the page will show:

- `session thread id: <numeric thread id>`
- `session reply: LIVE_BROWSER_SESSION_OK`
- `query reply: LIVE_BROWSER_QUERY_OK`

## Credential options

- Paste `restUrl`, choose the token type, and paste a token.

## What it proves

- the browser-safe `@snowflake/cortex-agent-sdk` entrypoint bundles in Next.js
  client code
- `client.conversations.create()` and `{ type: "coding" }` run without any
  local CLI process
- the browser directly calls the live Snowflake Agent API and renders the real
  returned output
- `query()` works from the same browser-only surface
