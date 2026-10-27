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

# Natural Language Analytics

Ask questions about your data in plain English. This use case demonstrates a natural-language query dashboard powered by the Cortex Agent SDK's analyst (text-to-SQL) tool.

A user types a question like *"What are the top 5 products by revenue?"*, and the app:

1. Sends the question to a Cortex Agent configured with the `cortex_analyst_text_to_sql` tool
2. The agent generates SQL from the question using your semantic view
3. Executes the SQL and returns results
4. Displays the natural-language answer, generated SQL, and a data table

## Prerequisites

- `SNOWFLAKE_ACCOUNT` and `SNOWFLAKE_PAT` environment variables
- `SNOWFLAKE_SEMANTIC_VIEW` — a fully-qualified semantic view (e.g. `MY_DB.MY_SCHEMA.MY_VIEW`)
- `SNOWFLAKE_WAREHOUSE` — warehouse for SQL execution (defaults to `COMPUTE_WH`)

## Implementations

### Next.js

```bash
cd nextjs
npm install
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... SNOWFLAKE_SEMANTIC_VIEW=... npm run dev
```

Open http://localhost:3000

### Streamlit

```bash
cd streamlit
pip install -r requirements.txt
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... SNOWFLAKE_SEMANTIC_VIEW=... streamlit run app.py
```

### FastAPI

```bash
cd fastapi
pip install -r requirements.txt
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... SNOWFLAKE_SEMANTIC_VIEW=... uvicorn main:app --reload
```

Open http://localhost:8000

## How it works

All three implementations follow the same pattern:

1. Create a `CortexAgentClient` with PAT authentication
2. Configure an inline agent with the `cortex_analyst_text_to_sql` tool pointing at your semantic view
3. Stream the agent response, extracting status updates, generated SQL, tabular data, and the answer text
4. Render the results in the UI

The SDK handles streaming, event parsing, and error handling. Your app just needs to configure the tools and display the results.
