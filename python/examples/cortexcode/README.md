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

# Cortex Code examples

Python Cortex Code examples.

Run from the repository root:

```bash
CORTEX_EXAMPLE_CONNECTION=default \
  python python/examples/cortexcode/query_cli.py
```

## Examples

- `query_cli.py`: runs through the installed Cortex Code CLI and supports its
  local control protocol.
- `mcp_hooks_fork.py`: registers an in-process MCP tool, observes it with
  pre/post hooks, forks the completed session, and proves that the fork retains
  context.

For server-side Agent API use, see `../coding_agent_run.py`; it uses the public
`code_toolset_all` coding-agent and conversation interfaces.
