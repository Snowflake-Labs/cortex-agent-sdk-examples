// Copyright 2026 Snowflake Inc.
// SPDX-License-Identifier: Apache-2.0
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"use client";

import { startTransition, useState } from "react";

import {
  CallableAuth,
  CortexAgentClient,
  OAuthAuth,
  SnowflakeSessionTokenAuth,
  type AgentResponse,
  type Conversation,
  type Turn,
} from "@snowflake/cortex-agent-sdk";

type DemoCredentials = {
  connectionName: string;
  restUrl: string;
  token: string;
  authTokenType: "SNOWFLAKE_TOKEN" | "OAUTH" | "KEYPAIR_JWT";
  user: string | null;
};

type AuthTokenType = DemoCredentials["authTokenType"];
type CredentialSource = "manual";

export default function BrowserDemo() {
  const [restUrl, setRestUrl] = useState("");
  const [token, setToken] = useState("");
  const [authTokenType, setAuthTokenType] =
    useState<AuthTokenType>("SNOWFLAKE_TOKEN");
  const [credentialSource, setCredentialSource] =
    useState<CredentialSource>("manual");
  const [connectionName, setConnectionName] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [output, setOutput] = useState<string>(
    [
      "This page imports the browser-safe Cortex Agent SDK from a client component.",
      "",
      'Paste credentials, or prefill them from a local Snowflake profile, then click "Run live browser demo".',
    ].join("\n"),
  );
  const [status, setStatus] = useState("Idle.");
  const [running, setRunning] = useState(false);

  async function runDemo(): Promise<void> {
    const currentRestUrl = restUrl.trim();
    const currentToken = token.trim();
    if (!currentRestUrl || !currentToken) {
      setStatus("Provide restUrl and token first.");
      setOutput(
        "Missing credentials. Paste a REST host and token, or load them from a local profile.",
      );
      return;
    }

    setRunning(true);
    setStatus(
      "Starting a CodingAgent conversation from the browser with explicit credentials...",
    );

    try {
      const client = new CortexAgentClient({
        baseUrl: currentRestUrl,
        auth: authenticatorFor(currentToken, authTokenType),
      });
      const lines = [
        `credential source: ${credentialSource === "manual" ? "manual" : "local profile prefill"}`,
        `connection: ${connectionName ?? "(manual token)"}`,
        `rest host: ${new URL(currentRestUrl).host}`,
        `user: ${user ?? "(unknown)"}`,
        `auth token type: ${authTokenType}`,
        "execution: browser-safe CodingAgent conversation",
      ];

      const conversation: Conversation = await client.conversations.create({
        thread: { origin_application: "cortex_agent_sdk" },
        agent: { type: "coding", spec: { permissionPolicy: "always_allow" } },
      });
      const turn: Turn = await conversation.send(
        "Reply with exactly: LIVE_BROWSER_SESSION_OK. Do not add any other words or punctuation.",
      );
      const eventCount = await countEvents(turn);
      const response: AgentResponse = await turn.result();
      lines.push(`session reply: ${response.text.trim()}`);
      lines.push(`session thread id: ${conversation.id}`);
      lines.push(`session run id: ${turn.id}`);
      lines.push(`session event count: ${eventCount}`);

      const queryConversation: Conversation = await client.conversations.create(
        {
          thread: { origin_application: "cortex_agent_sdk" },
          agent: { type: "coding", spec: { permissionPolicy: "always_allow" } },
        },
      );
      const queryTurn: Turn = await queryConversation.send(
        "Reply with exactly: LIVE_BROWSER_QUERY_OK. Do not add any other words or punctuation.",
      );
      const queryResponse: AgentResponse = await queryTurn.result();
      lines.push(`query reply: ${queryResponse.text.trim()}`);
      lines.push(`query thread id: ${queryConversation.id}`);

      startTransition(() => {
        setOutput(lines.join("\n"));
        setStatus("Live browser CodingAgent demo succeeded.");
      });
    } catch (error) {
      const message =
        error instanceof Error ? (error.stack ?? error.message) : String(error);
      startTransition(() => {
        setOutput(message);
        setStatus("Live browser CodingAgent demo failed.");
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Browser-safe SDK proof</span>
        <h1>CodingAgent in a real Next.js client.</h1>
        <p>
          This page runs from the browser, imports{" "}
          <code>@snowflake/cortex-agent-sdk</code> directly, and talks to the
          real Snowflake Agent API over HTTPS.
        </p>
      </section>

      <section className="panel-grid">
        <article className="card">
          <h2>Credentials</h2>
          <div className="form-grid">
            <label className="field">
              <span>REST URL</span>
              <input
                value={restUrl}
                onChange={(event) => {
                  setRestUrl(event.target.value);
                  setCredentialSource("manual");
                  setConnectionName(null);
                  setUser(null);
                }}
                placeholder="https://myaccount.snowflakecomputing.com"
                spellCheck={false}
                disabled={running}
              />
            </label>
            <label className="field">
              <span>Auth token type</span>
              <select
                value={authTokenType}
                onChange={(event) => {
                  setAuthTokenType(event.target.value as AuthTokenType);
                  setCredentialSource("manual");
                  setConnectionName(null);
                  setUser(null);
                }}
                disabled={running}
              >
                <option value="SNOWFLAKE_TOKEN">SNOWFLAKE_TOKEN</option>
                <option value="OAUTH">OAUTH</option>
                <option value="KEYPAIR_JWT">KEYPAIR_JWT</option>
              </select>
            </label>
            <label className="field token-field">
              <span>Token</span>
              <textarea
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setCredentialSource("manual");
                  setConnectionName(null);
                  setUser(null);
                }}
                placeholder="Paste a Snowflake session token, OAuth token, or key-pair JWT"
                spellCheck={false}
                disabled={running}
              />
            </label>
          </div>
          <div className="button-row">
            <button type="button" onClick={runDemo} disabled={running}>
              {running
                ? "Running live browser demo..."
                : "Run live browser demo"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setRestUrl("");
                setToken("");
                setAuthTokenType("SNOWFLAKE_TOKEN");
                setCredentialSource("manual");
                setConnectionName(null);
                setUser(null);
                setOutput("Output cleared.");
                setStatus("Idle.");
              }}
              disabled={running}
            >
              Clear all
            </button>
          </div>
          <p className="helper">
            Paste <code>restUrl</code> and a token directly into the browser.
          </p>
          <h2>What this exercise covers</h2>
          <ul className="details">
            <li>
              The import lives in a client component, so Next must
              browser-bundle the SDK subpath.
            </li>
            <li>
              The demo uses <code>client.conversations.create()</code> and
              CodingAgent turns from the same browser-safe surface.
            </li>
            <li>
              The browser never relies on the local CLI. In the main path it
              also does not rely on any Node-side auth helper after the page has
              the explicit credentials.
            </li>
          </ul>
          <p className="status">{status}</p>
          <p className="note">
            The page prints the actual thread and run IDs plus model replies
            returned from the live Agent API calls. It does not auto-delete the
            created threads.
          </p>
        </article>

        <section className="console-card" aria-live="polite">
          <div className="console-header">
            <span>browser-run.log</span>
            <span className="console-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
          <pre>{output}</pre>
        </section>
      </section>
    </main>
  );
}

function authenticatorFor(token: string, authTokenType: AuthTokenType) {
  if (authTokenType === "SNOWFLAKE_TOKEN")
    return new SnowflakeSessionTokenAuth(token);
  if (authTokenType === "OAUTH") return new OAuthAuth(token);
  return new CallableAuth(() => token, "KEYPAIR_JWT");
}

async function countEvents(turn: Turn): Promise<number> {
  let count = 0;
  for await (const _event of turn.events()) count += 1;
  return count;
}
