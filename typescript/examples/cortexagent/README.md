# TypeScript conversation examples

These examples use the higher-level conversation interface from the SDK root
package.

Run from the repository root:

```bash
SNOWFLAKE_ACCOUNT=myaccount SNOWFLAKE_PAT='...' \
  npx tsx typescript/examples/cortexagent/conversation.ts
```

## Examples

- `conversation.ts`: create a conversation, send turns, attach to an existing
  conversation, branch from a prior message, and delete the conversation.
- `conversation-client-content.ts`: send client-supplied content such as tool
  results and staged documents.

Use `CORTEX_EXAMPLE_DOCUMENT_URL` with `conversation-client-content.ts` to test
document input. The value must point to a Snowflake staged file, for example
`@my_stage/path/file.txt`.
