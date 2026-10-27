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
  "A dashboard showing sales by region with a bar chart",
  "A simple todo app with add, complete, and delete",
  "A weather lookup app — enter a city, see the forecast",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMessage: Message = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);

      const assistantIndex =
        messages.length + 1; /* index of the new assistant message */
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text.trim(), threadId }),
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
        inputRef.current?.focus();
      }
    },
    [loading, messages.length, threadId],
  );

  return (
    <div className="container">
      <header className="header">
        <h1>App Builder Agent</h1>
        <p>Describe the app you want — an AI agent builds it</p>
      </header>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>What do you want to build?</h2>
            <p>
              Describe a data app, dashboard, or tool and the coding agent will
              generate it. You can refine across multiple turns.
            </p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  className="example"
                  onClick={() => send(ex)}
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
                <RenderedContent content={msg.content} />
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

      <form
        className="input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the app you want to build..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

/** Renders assistant text with code blocks extracted and styled. */
function RenderedContent({ content }: { content: string }) {
  if (!content) return null;

  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <InlineText key={lastIndex} text={content.slice(lastIndex, match.index)} />,
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
    parts.push(<InlineText key={lastIndex} text={content.slice(lastIndex)} />);
  }

  return <>{parts}</>;
}

/** Renders plain text with inline `code` spans. */
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
