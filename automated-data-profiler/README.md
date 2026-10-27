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

# Automated Data Profiler

Point it at a table — get a comprehensive data quality report. This use case demonstrates a coding agent that automatically profiles a Snowflake table: inspects schema, checks for nulls, analyzes distributions, detects outliers, validates freshness, and generates a structured quality report.

A user provides a fully-qualified table name and the agent:

1. Inspects the table schema (columns, types, row count)
2. Runs quality checks — null rates, cardinality, min/max/mean for numerics, value distributions for categoricals
3. Detects potential issues — high null rates, low cardinality flags, outliers beyond 3 standard deviations
4. Checks freshness — when the table was last updated relative to now
5. Generates a structured quality report with pass/warn/fail ratings per column

## Prerequisites

- `SNOWFLAKE_ACCOUNT` and `SNOWFLAKE_PAT` environment variables
- A table to profile (set via `SNOWFLAKE_PROFILE_TABLE` or entered in the UI)

## Implementations

### Next.js

```bash
cd nextjs
npm install
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npm run dev
```

Open http://localhost:3003

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
2. Start a Conversation with a coding agent (`type: "coding"`) that has `permission_policy: "always_allow"`
3. Send a detailed first message instructing the agent to profile the target table — the prompt includes specific checks to run (null analysis, distributions, outliers, freshness)
4. The coding agent runs SQL queries autonomously (DESCRIBE TABLE, SELECT COUNT, aggregations, statistical queries)
5. Stream and display the agent's findings as a structured profile report
6. User can follow up: "Show me the rows where revenue is NULL" or "What's the distribution of the status column?"

The coding agent writes and executes all the profiling SQL itself — no pre-built queries are needed. This makes it adaptable to any table schema without configuration.
