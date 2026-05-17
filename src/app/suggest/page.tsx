"use client";

import { useState } from "react";

export default function SuggestPage() {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "suggestion_failed");
        return;
      }
      setDone(true);
      setBody("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Suggestions</h1>
      <p>
        Send a suggestion, bug report, or anything else. Goes straight to the admin inbox; we read
        everything.
      </p>
      {done && <div className="success">Thanks - got it.</div>}
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit} className="stack">
        <label>
          <span>Your suggestion</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={1}
            maxLength={5000}
            required
            autoFocus
          />
        </label>
        <button type="submit" disabled={busy || body.length < 1}>
          {busy ? "Sending…" : "Send"}
        </button>
      </form>
    </>
  );
}
