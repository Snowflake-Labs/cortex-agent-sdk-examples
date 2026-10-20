# Python examples

Python examples for `snowflake-cortex-agent-sdk`.

## Setup

Create an environment and install dependencies from the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Run examples from the repository root:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  python python/examples/stream_agent_run.py
```

The Python examples require SDK version `0.0.2` or later.

## Folders

- `examples/`: runnable Python examples.
- `examples_output/`: sanitized representative output from successful runs.

See each subfolder README for the feature area and required environment
variables.
