"use client";

import { useState, FormEvent } from "react";

interface TableData {
  columns: string[];
  rows: Record<string, unknown>[];
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [answer, setAnswer] = useState("");
  const [sql, setSql] = useState("");
  const [table, setTable] = useState<TableData | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setStatus("Sending query...");
    setAnswer("");
    setSql("");
    setTable(null);
    setError("");

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

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
            switch (event.type) {
              case "status":
                setStatus(event.message);
                break;
              case "text":
                setAnswer((prev) => prev + event.text);
                break;
              case "sql":
                setSql(event.sql);
                break;
              case "table":
                setTable(event.data);
                break;
              case "error":
                setError(event.message);
                break;
              case "done":
                setStatus("");
                break;
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      setStatus("");
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Natural Language Analytics</h1>
        <p>Ask questions about your data in plain English</p>
      </header>

      <form className="query-form" onSubmit={handleSubmit}>
        <input
          className="query-input"
          type="text"
          placeholder="e.g. What are the top 10 customers by revenue?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="ask-button" type="submit" disabled={loading}>
          {loading ? "Working..." : "Ask"}
        </button>
      </form>

      {status && (
        <div className="status">
          <span className="spinner" />
          {status}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="results">
        {answer && (
          <div className="card">
            <h2>Answer</h2>
            <div className="answer-text">{answer}</div>
          </div>
        )}

        {sql && (
          <div className="card">
            <h2>Generated SQL</h2>
            <pre className="sql-block">{sql}</pre>
          </div>
        )}

        {table && table.rows.length > 0 && (
          <div className="card">
            <h2>Results ({table.rows.length} rows)</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {table.columns.map((col) => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i}>
                      {table.columns.map((col) => (
                        <td key={col}>{String(row[col] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
