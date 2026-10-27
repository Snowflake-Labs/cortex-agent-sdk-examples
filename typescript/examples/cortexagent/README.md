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

# TypeScript conversation examples

These examples use the higher-level conversation interface from the SDK root
package.

Run from the repository root:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/cortexagent/conversation.ts
```

## Examples

- `conversation.ts`: create a conversation, send turns, attach to an existing
  conversation, branch from a prior message, and delete the conversation.
- `conversation-client-content.ts`: send client-supplied content such as tool
  results and staged documents.

Use `CORTEX_EXAMPLE_DOCUMENT_URL` with `conversation-client-content.ts` to test
document input. The value must point to a Snowflake staged file, for example
`@my_stage/path/file.txt`.
