# Cortex Code examples

- `query_cli.py` runs through the installed Cortex Code CLI and supports its
  full local control protocol.
- For server-side Agent API use, see `examples/coding_agent_run.py`; it uses
  the public `code_toolset_all` coding-agent and conversation interfaces.
- `mcp_hooks_fork.py` registers an in-process MCP tool, observes it with pre/post
  hooks, forks the completed session, and proves that the fork retains context.
