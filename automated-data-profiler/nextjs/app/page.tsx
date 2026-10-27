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

import { useCallback, useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const EXAMPLES = [
  "SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS",
  "SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.CUSTOMER",
  "SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.LINEITEM",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const followUpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamResponse = useCallback(
    async (body: { table?: string; message?: string; threadId?: string }) => {
      if (loading) return;
      setLoading(true);

      const userContent = body.message ?? `Profile table: ${body.table}`;
      setMessages((prev) => [...prev, { role: "user", content: userContent }]);

      const assistantIndex = messages.length + 1;
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.text();
          setMessages((prev) => {
            const updated = [...prev];
            updated[assistantIndex] = {
              role: "assistant",
              content: `Error: ${err}`,
            };
            return updated;
          });
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line);
              if (event.type === "threadId") {
                setThreadId(event.threadId);
              } else if (event.type === "text") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const msg = updated[assistantIndex];
                  if (msg) {
                    updated[assistantIndex] = {
                      ...msg,
                      content: msg.content + event.text,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              /* skip malformed lines */
            }
          }
        }
      } catch (err) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIndex] = {
            role: "assistant",
            content: `Network error: ${err instanceof Error ? err.message : String(err)}`,
          };
          return updated;
        });
      } finally {
        setLoading(false);
        followUpRef.current?.focus();
      }
    },
    [loading, messages.length],
  );

  const profileTable = useCallback(
    (name: string) => {
      const fqn = name.trim();
      if (!fqn) return;
      setTableName(fqn);
      streamResponse({ table: fqn });
    },
    [streamResponse],
  );

  const sendFollowUp = useCallback(
    (text: string) => {
      if (!text.trim() || !threadId) return;
      setFollowUp("");
      streamResponse({ message: text.trim(), threadId });
    },
    [streamResponse, threadId],
  );

  return (
    <div className="container">
      <header className="header">
        <h1>Automated Data Profiler</h1>
        <p>
          Comprehensive table quality reports powered by AI
        </p>
      </header>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Profile a Snowflake Table</h2>
            <p>
              Enter a fully qualified table name and the coding agent will
              analyze its schema, data quality, statistics, and freshness.
            </p>
            <form
              className="table-input-form"
              onSubmit={(e) => {
                e.preventDefault();
                profileTable(tableName);
              }}
            >
              <input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="DB.SCHEMA.TABLE"
                disabled={loading}
              />
              <button type="submit" disabled={loading || !tableName.trim()}>
                Profile Table
              </button>
            </form>
            <p style={{ marginTop: 16, fontSize: 13 }}>Or try an example:</p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  className="example"
                  onClick={() => profileTable(ex)}
                  disabled={loading}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message message-${msg.role}`}>
              {msg.role === "assistant" ? (
                <RenderedMarkdown content={msg.content} />
              ) : (
                msg.content
              )}
            </div>
          ))
        )}
        {loading && messages[messages.length - 1]?.content === "" && (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {messages.length > 0 && (
        <form
          className="input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            sendFollowUp(followUp);
          }}
        >
          <input
            ref={followUpRef}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            placeholder="Ask a follow-up question about the data..."
            disabled={loading || !threadId}
          />
          <button
            type="submit"
            disabled={loading || !followUp.trim() || !threadId}
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function RenderedMarkdown({ content }: { content: string }) {
  if (!content) return null;

  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <MarkdownText
          key={lastIndex}
          text={content.slice(lastIndex, match.index)}
        />,
      );
    }

    const lang = match[1] || "code";
    const code = match[2].replace(/\n$/, "");

    parts.push(
      <span key={match.index}>
        <span className="code-block-header">
          <span>{lang}</span>
          <button
            className="copy-btn"
            type="button"
            onClick={() => navigator.clipboard.writeText(code)}
          >
            Copy
          </button>
        </span>
        <code className="code-block">{code}</code>
      </span>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <MarkdownText key={lastIndex} text={content.slice(lastIndex)} />,
    );
  }

  return <>{parts}</>;
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect markdown table
    if (
      i + 1 < lines.length &&
      line.includes("|") &&
      lines[i + 1].match(/^\|?[\s-:|]+\|/)
    ) {
      const tableLines: string[] = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(<MarkdownTable key={i} lines={tableLines} />);
      continue;
    }

    // Headings
    const h3Match = line.match(/^###\s+(.*)/);
    if (h3Match) {
      elements.push(<h3 key={i}>{renderInline(h3Match[1])}</h3>);
      i++;
      continue;
    }
    const h2Match = line.match(/^##\s+(.*)/);
    if (h2Match) {
      elements.push(<h2 key={i}>{renderInline(h2Match[1])}</h2>);
      i++;
      continue;
    }
    const h1Match = line.match(/^#\s+(.*)/);
    if (h1Match) {
      elements.push(<h1 key={i}>{renderInline(h1Match[1])}</h1>);
      i++;
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      elements.push(<hr key={i} />);
      i++;
      continue;
    }

    // List items
    if (line.match(/^[\s]*[-*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[\s]*[-*]\s/)) {
        items.push(lines[i].replace(/^[\s]*[-*]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={i}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    elements.push(<p key={i}>{renderInline(line)}</p>);
    i++;
  }

  return <>{elements}</>;
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const parseRow = (row: string) =>
    row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  return (
    <table>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i}>{renderInline(h)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{renderInline(cell)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\*(.+?)\*)/g;
  let last = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={match.index}>{match[2]}</strong>);
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className="inline-code">
          {match[4]}
        </code>,
      );
    } else if (match[6]) {
      parts.push(<em key={match.index}>{match[6]}</em>);
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
