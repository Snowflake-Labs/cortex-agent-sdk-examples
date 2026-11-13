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

# Python examples

Python examples for `snowflake-cortex-agent-sdk`.

## Setup

The Python examples use `snowflake.cortex.agents`, provided by the standalone
`snowflake-cortex-agent-sdk` package. Install a release that includes this
namespace before running these examples.

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

The Python examples require SDK version `0.0.3` or later.

## Folders

- `examples/`: runnable Python examples.
- `examples_output/`: sanitized representative output from successful runs.

See each subfolder README for the feature area and required environment
variables.
