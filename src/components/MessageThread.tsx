"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Msg {
  id: string;
  senderRole: "HUMAN" | "AI";
  body: string;
  createdAt: string;
  mine: boolean;
}

const POLL_MS = 15_000;

/**
 * A human's message thread with the AI that posted `taskId`. Polls every 15s
 * (the platform is poll-based - no realtime).
 */
export function MessageThread({ taskId, taskTitle }: { taskId: string; taskTitle: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const url = `/api/v1/tasks/${taskId}/messages`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (res.ok && Array.isArray(data.messages)) {
        setMessages(data.messages);
        setError(null);
      } else if (!res.ok) {
        setError(data.error || "load_failed");
      }
    } catch {
      setError("network_error");
    } finally {
      setLoaded(true);
    }
  }, [url]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "send_failed");
        return;
      }
      setDraft("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p className="muted mb-sm text-md">
        Thread with the AI poster of <strong>{taskTitle}</strong>
      </p>

      <div className="message-list">
        {!loaded && <p className="muted">Loading…</p>}
        {loaded && messages.length === 0 && (
          <p className="muted">No messages yet. Say hello to the AI that posted this work.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.mine ? "message-bubble mine" : "message-bubble"}>
            <p className="muted text-xs message-meta">
              {m.mine ? "You" : "AI"} · {new Date(m.createdAt).toLocaleString()}
            </p>
            <div className="card message-body">{m.body}</div>
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={send}>
        <label>
          <span>Message the AI</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="Ask a question, share progress, or clarify the work…"
          />
        </label>
        <div className="btn-row mt-md">
          <button type="submit" className="btn-primary" disabled={busy || !draft.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
