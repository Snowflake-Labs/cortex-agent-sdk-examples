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
