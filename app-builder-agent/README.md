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

# App Builder Agent

Describe the app you want — an AI agent builds it. This use case demonstrates a multi-turn coding agent conversation where users describe a data app in plain language and a Cortex Coding Agent generates the code.

A user says *"Build me a dashboard showing sales by region with a date filter"*, and the agent:

1. Generates complete application code (Streamlit, or whatever framework fits)
2. Explains what it built
3. Accepts follow-up requests to refine — *"Add a pie chart for the category breakdown"*

The conversation persists across turns, so the agent remembers context and iterates on its previous output.

## Prerequisites

- `SNOWFLAKE_ACCOUNT` and `SNOWFLAKE_PAT` environment variables

No additional Snowflake objects are needed — the coding agent generates code based on your description.

## Implementations

### Next.js

```bash
cd nextjs
npm install
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npm run dev
```

Open http://localhost:3001

### Streamlit

```bash
cd streamlit
pip install -r requirements.txt
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... streamlit run app.py
```

### FastAPI

```bash
cd fastapi
pip install -r requirements.txt
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... uvicorn main:app --reload
```

Open http://localhost:8000

## How it works

All three implementations follow the same pattern:

1. Create a `CortexAgentClient` with PAT authentication
2. Start a `Conversation` with a coding agent (`type: "coding"`)
3. Send the user's message via `conversation.send()`
4. Stream and display the agent's response (which includes generated code)
5. On follow-up messages, reuse the same conversation for multi-turn refinement

The SDK manages thread state, so multi-turn works automatically — each `conversation.send()` appends to the same thread and the agent has full context of prior turns.
