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

# TypeScript examples

Runnable TypeScript examples for the Cortex Agent SDK.

Run commands from the repository root. Most Agent API examples use
`SNOWFLAKE_ACCOUNT` plus `SNOWFLAKE_PAT`:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/api/non-streaming.ts
```

Examples that reuse an existing Snowflake driver session use a local connection
profile:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  npx tsx typescript/examples/auth/session-token.ts
```

## Subfolders

- `api/`: direct Agent API examples.
- `auth/`: authentication provider examples.
- `cortexagent/`: higher-level conversation examples.
- `cortexcode/`: Cortex Code CLI/session examples.
- `cortexcode-next-app/`: browser bundling demo.

`_snowflake-session.ts` is a helper used by session-token examples.
