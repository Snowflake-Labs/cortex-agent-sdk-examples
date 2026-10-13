/**
 * Structured output — constrain the final answer to a JSON Schema.
 *
 * `outputFormat: { type: "json_schema", schema }` is forwarded to the CLI as
 * `--json-schema`. The CLI validates the model's final message against the
 * schema and, on success, attaches the parsed object to the `result` event as
 * `structured_output`. The raw text stays available in `result.result`.
 *
 * If the model cannot produce conforming output after retries, the result comes
 * back with `subtype: "error_max_structured_output_retries"` instead.
 *
 * This example demonstrates:
 *   1. A scalar schema — reading a number and a string out of the result
 *   2. A nested schema with an array, populated from real files on disk
 *
 * Requires Node 22+ and the `cortex` CLI (>= 1.0.35) on PATH. A cold CLI start
 * can exceed the SDK's 60s `initialize` budget; raise it with
 * `CORTEX_CODE_INITIALIZE_TIMEOUT_MS` if you hit
 * "Control request timeout: initialize".
 *
 * Usage:
 *   CORTEX_EXAMPLE_CONNECTION=<connection> npx tsx examples/cortexcode/structured-output.ts
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { query, type CortexCodeEvent } from "@snowflake/cortex-agent-sdk/code";

const connection: string | undefined =
  process.env.CORTEX_EXAMPLE_CONNECTION ??
  process.env.SNOWFLAKE_DEFAULT_CONNECTION_NAME;

const workdir: string = mkdtempSync(join(tmpdir(), "cortexcode-structured-"));
writeFileSync(
  join(workdir, "package.json"),
  JSON.stringify(
    { name: "halcyon-tools", version: "2.3.0", license: "Apache-2.0" },
    null,
    2,
  ) + "\n",
);

/** Run one turn and return its terminal `result` event. */
async function runToResult(
  prompt: string,
  schema: Record<string, unknown>,
  allowedTools: string[],
): Promise<Extract<CortexCodeEvent, { type: "result" }> | undefined> {
  let terminal: Extract<CortexCodeEvent, { type: "result" }> | undefined;
  for await (const event of query({
    prompt,
    options: {
      cwd: workdir,
      // Skip the CLI's launch-time auto-update check: in a scripted run it can
      // push startup past the SDK's `initialize` budget, and a pinned CLI is what
      // you want anyway. `extraArgs` keys are CLI flags without the leading `--`.
      extraArgs: { "no-auto-update": null },
      allowedTools,
      onlyExplicitMcpServers: true,
      outputFormat: { type: "json_schema", schema },
      ...(connection ? { connection } : {}),
    },
  })) {
    if (event.type === "result") terminal = event;
  }
  return terminal;
}

console.log("=== 1. A flat schema ===");
const flatSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    answer: { type: "number" },
    explanation: { type: "string" },
  },
  required: ["answer", "explanation"],
  additionalProperties: false,
};
console.log(`  schema: ${JSON.stringify(flatSchema)}`);

const flat = await runToResult(
  "What is 17 times 3? Return the numeric answer and a one-sentence explanation.",
  flatSchema,
  [],
);
if (flat?.subtype === "success") {
  const output = flat.structured_output as
    { answer?: number; explanation?: string } | undefined;
  console.log(`  subtype:               ${flat.subtype}`);
  console.log(`  structured_output set: ${output !== undefined}`);
  console.log(`  typeof answer:         ${typeof output?.answer}`);
  console.log(`  answer:                ${output?.answer}`);
  console.log(`  explanation:           ${output?.explanation}`);
} else {
  console.log(`  subtype: ${flat?.subtype ?? "(no result)"}`);
  if (flat?.is_error) console.log(`  errors: ${JSON.stringify(flat.errors)}`);
}

console.log("\n=== 2. A nested schema, filled from a real file ===");
const nestedSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    package: {
      type: "object",
      properties: {
        name: { type: "string" },
        version: { type: "string" },
      },
      required: ["name", "version"],
    },
    top_level_keys: { type: "array", items: { type: "string" } },
  },
  required: ["package", "top_level_keys"],
  additionalProperties: false,
};
console.log(`  schema: ${JSON.stringify(nestedSchema)}`);

const nested = await runToResult(
  "Read package.json in the current directory and report its name, its version, " +
    "and every top-level key it declares.",
  nestedSchema,
  ["Read"],
);
if (nested?.subtype === "success") {
  const output = nested.structured_output as
    | {
        package?: { name?: string; version?: string };
        top_level_keys?: string[];
      }
    | undefined;
  console.log(`  subtype:            ${nested.subtype}`);
  console.log(`  package.name:       ${output?.package?.name}`);
  console.log(`  package.version:    ${output?.package?.version}`);
  console.log(
    `  top_level_keys:     ${JSON.stringify(output?.top_level_keys)}`,
  );
  console.log(
    `  top_level_keys is an array: ${Array.isArray(output?.top_level_keys)}`,
  );
  // `result.result` still holds the raw final text. It is *not* guaranteed to be
  // bare JSON — the model may fence or annotate it — which is exactly why
  // `structured_output` exists: read the parsed object, not the text.
  console.log(`  raw result parses as JSON: ${jsonParses(nested.result)}`);
  console.log(`  raw result first line:     ${nested.result.split("\n")[0]}`);
} else {
  console.log(`  subtype: ${nested?.subtype ?? "(no result)"}`);
  if (nested?.is_error)
    console.log(`  errors: ${JSON.stringify(nested.errors)}`);
}

function jsonParses(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
