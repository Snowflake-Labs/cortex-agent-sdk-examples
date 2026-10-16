# Pipeline Auditor

Discover and audit your Snowflake data pipeline objects for health issues. This use case demonstrates a coding agent that automatically inspects pipeline objects (dynamic tables, tasks, streams, pipes) in a database, runs health checks, and produces a structured report with severity-rated findings.

Adapted from the [Pipeline Auditor quickstart](https://quickstarts.snowflake.com/guide/pipeline-auditor-with-cortex-agent-sdk/).

A user selects a database and the agent:

1. Discovers all pipeline-related objects (dynamic tables, tasks, streams, pipes, views)
2. Runs health checks against each object — staleness, failures, suspended state, missing dependencies
3. Produces a structured report with severity ratings (critical / warning / info)
4. Offers to suggest fixes for any issues found

## Prerequisites

- `SNOWFLAKE_ACCOUNT` and `SNOWFLAKE_PAT` environment variables
- A database with pipeline objects (dynamic tables, tasks, streams, etc.) to audit

## Implementations

### Next.js

```bash
cd nextjs
npm install
SNOWFLAKE_ACCOUNT=... SNOWFLAKE_PAT=... npm run dev
```

Open http://localhost:3002

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
3. Send a system-prompt-style first message instructing the agent to discover pipeline objects in the target database and run health checks
4. The coding agent runs SQL commands (SHOW DYNAMIC TABLES, SHOW TASKS, etc.) and inspects the results
5. Stream and display the agent's structured findings — object name, type, status, severity, and recommended action
6. Optionally follow up: "Fix the suspended task X" triggers a multi-turn repair conversation

The coding agent has full SQL access in its sandbox, so it can run SHOW, DESCRIBE, and diagnostic queries autonomously. The `permission_policy: "always_allow"` setting lets it execute without prompting for each command.
