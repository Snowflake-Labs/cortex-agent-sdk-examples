/**
 * Resuming and forking a CLI session.
 *
 * The CLI persists every session's transcript under its own state directory,
 * keyed by the `session_id` on the `result` event. Two ways back in:
 *
 *   - `resume: <sessionId>` continues that session in place; new turns append
 *     to the same transcript.
 *   - `forkSession()` replays the transcript into a *new* session id, leaving
 *     the original untouched — so you can branch an investigation without
 *     polluting the history you branched from.
 *
 * Both are CLI-mode concepts. API mode rejects `resume`/`continue` outright and
 * uses `sessionId` (an Agent API thread ID) with `forkSession` instead.
 *
 * This example demonstrates:
 *   1. Establishing a fact in session A and capturing its session_id
 *   2. `resume` — session A remembers the fact
 *   3. `forkSession()` — a new id whose transcript carries the same fact
 *   4. Writing to the fork does not change the original
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * can exceed the SDK's 60s `initialize` budget; raise it with
 * `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/fork-resume.ts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCortexCodeSession,
  forkSession,
  query,
  type CortexCodeEvent,
  type CortexCodeSession,
  type ForkSessionResult,
  type SessionOptions,
} from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-fork-resume-"));

const baseOptions: SessionOptions = {
  cwd: workdir,
  // Skip the CLI's launch-time auto-update check: in a scripted run it can
  // push startup past the SDK's `initialize` budget, and a pinned CLI is what
  // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
  extraArgs: { "no-auto-update": null },
  allowedTools: [],
  onlyExplicitMcpServers: true,
  ...(connection ? { connection } : {}),
};

async function drainTurn(
  session: CortexCodeSession,
): Promise<CortexCodeEvent[]> {
  const events: CortexCodeEvent[] = [];
  for await (const event of session.stream()) {
    events.push(event);
    if (event.type === "result") break;
  }
  return events;
}

function assistantText(events: CortexCodeEvent[]): string {
  return events
    .filter(
      (e): e is Extract<CortexCodeEvent, { type: "assistant" }> =>
        e.type === "assistant",
    )
    .flatMap((e) => e.content)
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/** Ask one question through `query()` and return the assistant text. */
async function askOnce(
  prompt: string,
  options: SessionOptions,
): Promise<string> {
  const events: CortexCodeEvent[] = [];
  for await (const event of query({ prompt, options })) events.push(event);
  return assistantText(events);
}

console.log("=== 1. Establish a fact and capture the session id ===");
const original: CortexCodeSession = await createCortexCodeSession(baseOptions);
await original.send(
  "Remember this code word for later: MERIDIAN. Acknowledge in three words.",
);
const firstTurn: CortexCodeEvent[] = await drainTurn(original);
await original.close();

const firstResult = firstTurn.find((e) => e.type === "result");
const originalSessionId: string | undefined =
  firstResult?.type === "result" ? firstResult.session_id : undefined;
console.log(`  reply: ${assistantText(firstTurn)}`);
console.log(`  session id captured: ${originalSessionId !== undefined}`);

if (originalSessionId === undefined) {
  throw new Error(
    "no session_id on the result event; cannot demonstrate resume/fork",
  );
}

console.log("\n=== 2. resume continues the same session ===");
const resumedAnswer: string = await askOnce(
  "What code word did I ask you to remember? Reply with just that word.",
  { ...baseOptions, resume: originalSessionId },
);
console.log(`  reply: ${resumedAnswer}`);
console.log(
  `  recalled the code word: ${resumedAnswer.toUpperCase().includes("MERIDIAN")}`,
);

console.log("\n=== 3. forkSession branches into a new session id ===");
// `forkSession` spawns a session with `resume` + `--fork-session`, reads the new
// id off the init message, and closes it — so it costs no model turn.
const forked: ForkSessionResult = await forkSession(
  originalSessionId,
  baseOptions,
);
console.log(`  fork returned an id:     ${forked.sessionId.length > 0}`);
console.log(
  `  differs from the source: ${forked.sessionId !== originalSessionId}`,
);

const forkAnswer: string = await askOnce(
  "What code word did I ask you to remember? Reply with just that word.",
  { ...baseOptions, resume: forked.sessionId },
);
console.log(
  `  fork recalls the code word: ${forkAnswer.toUpperCase().includes("MERIDIAN")}`,
);
console.log(`  fork reply: ${forkAnswer}`);

console.log("\n=== 4. Writing to the fork leaves the source untouched ===");
// Add a second code word to the fork only.
await askOnce("Also remember: ORACLE. Acknowledge in three words.", {
  ...baseOptions,
  resume: forked.sessionId,
});

const forkKnows: string = await askOnce(
  "List every code word I have asked you to remember in this conversation, comma separated.",
  { ...baseOptions, resume: forked.sessionId },
);
const sourceKnows: string = await askOnce(
  "List every code word I have asked you to remember in this conversation, comma separated.",
  { ...baseOptions, resume: originalSessionId },
);
console.log(`  fork sees:   ${forkKnows}`);
console.log(`  source sees: ${sourceKnows}`);
console.log(
  `  fork has ORACLE:   ${forkKnows.toUpperCase().includes("ORACLE")}`,
);
console.log(
  `  source has ORACLE: ${sourceKnows.toUpperCase().includes("ORACLE")}`,
);
