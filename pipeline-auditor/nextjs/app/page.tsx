"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const EXAMPLE_DBS = ["ANALYTICS", "RAW_DATA", "PROD_DW"];

export default function Home() {
  const [database, setDatabase] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const streamResponse = useCallback(
    async (body: { database: string; message?: string; threadId?: string }) => {
      const assistantIndex = messages.length + 1;
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/audit", {
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
      }
    },
    [messages.length],
  );

  const runAudit = useCallback(
    async (db: string) => {
      const name = db.trim().toUpperCase();
      if (!name || loading) return;

      setDatabase(name);
      setAuditing(true);
      setLoading(true);

      const userMsg: Message = {
        role: "user",
        content: `Audit pipeline objects in database: ${name}`,
      };
      setMessages([userMsg]);
      setThreadId(null);

      await streamResponse({ database: name });
      setLoading(false);
    },
    [loading, streamResponse],
  );

  const sendFollowUp = useCallback(
    async (text: string) => {
      if (!text.trim() || loading || !threadId) return;

      const userMessage: Message = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);

      await streamResponse({
        database,
        message: text.trim(),
        threadId,
      });
      setLoading(false);
      inputRef.current?.focus();
    },
    [loading, threadId, database, streamResponse],
  );

  return (
    <div className="container">
      <header className="header">
        <h1>Pipeline Auditor</h1>
        <p>Discover and audit your data pipeline objects</p>
      </header>

      {!auditing ? (
        <>
          <div className="messages">
            <div className="empty-state">
              <h2>Audit a Snowflake database</h2>
              <p>
                Enter a database name to discover dynamic tables, tasks,
                streams, and pipes — then get a health report with issues and
                recommendations.
              </p>
              <div className="examples">
                {EXAMPLE_DBS.map((db) => (
                  <button
                    key={db}
                    className="example"
                    onClick={() => runAudit(db)}
                    disabled={loading}
                  >
                    {db}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <form
            className="db-bar"
            onSubmit={(e) => {
              e.preventDefault();
              runAudit(database);
            }}
          >
            <label htmlFor="db-input">Database</label>
            <input
              id="db-input"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder="MY_DATABASE"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !database.trim()}>
              Run Audit
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="messages">
            {messages.map((msg, i) => (
              <div key={i} className={`message message-${msg.role}`}>
                {msg.role === "assistant" ? (
                  <RenderedContent content={msg.content} />
                ) : (
                  msg.content
                )}
              </div>
            ))}
            {loading && messages[messages.length - 1]?.content === "" && (
              <div className="typing">
                <span />
                <span />
                <span />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form
            className="input-bar"
            onSubmit={(e) => {
              e.preventDefault();
              sendFollowUp(input);
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a follow-up — e.g. &quot;Show me the failing tasks&quot;"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function RenderedContent({ content }: { content: string }) {
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
  const tableRegex =
    /((?:\|[^\n]+\|\r?\n)(?:\|[\s:|-]+\|\r?\n)((?:\|[^\n]+\|\r?\n?)*))/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match;

  while ((match = tableRegex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(
        <InlineText key={`t${last}`} text={text.slice(last, match.index)} />,
      );
    }
    parts.push(<MdTable key={`tbl${match.index}`} raw={match[0]} />);
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(<InlineText key={`t${last}`} text={text.slice(last)} />);
  }

  return <>{parts}</>;
}

function MdTable({ raw }: { raw: string }) {
  const lines = raw.trim().split("\n");
  if (lines.length < 2) return <span>{raw}</span>;

  const parseRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  return (
    <table className="md-table">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InlineText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const inlineRegex = /`([^`]+)`/g;
  let last = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <code key={match.index} className="inline-code">
        {match[1]}
      </code>,
    );
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return <>{parts}</>;
}
