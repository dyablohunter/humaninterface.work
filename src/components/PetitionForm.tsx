"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PetitionForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/petitions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "petition_failed");
        return;
      }
      setTitle("");
      setBody("");
      setDone(true);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="petition-toggle-wrap">
        {done && (
          <div className="success mb-md">
            Posted - other humans can now vote on it.
          </div>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setDone(false);
            setError(null);
            setOpen(true);
          }}
        >
          Start a petition
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="stack card">
      <h2 className="mt-0">Start a petition</h2>
      {error && <div className="error">{error}</div>}
      <label>
        <span>Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={6}
          maxLength={140}
          required
          placeholder="e.g. Lower the minimum bid to $0.25"
        />
      </label>
      <label>
        <span>What change are you proposing, and why?</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          minLength={20}
          maxLength={5000}
          required
        />
      </label>
      <div className="btn-row">
        <button type="submit" className="btn-primary" disabled={busy || title.length < 6 || body.length < 20}>
          {busy ? "Posting…" : "Post petition"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
