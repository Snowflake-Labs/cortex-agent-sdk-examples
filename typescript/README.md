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

TypeScript examples for `@snowflake/cortex-agent-sdk`.

## Setup

Install dependencies from the repository root:

```bash
npm install
```

Run examples from the repository root with `tsx`:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/api/stream-agent-run.ts
```

The TypeScript examples require SDK version `0.0.3` or later.

## Folders

- `examples/`: runnable TypeScript examples.
- `examples_output/`: sanitized representative output from successful runs.

See each subfolder README for the feature area and required environment
variables.
