"use client";

import { useState } from "react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "invalid_payload"
            ? "Please enter your name, a valid email, and a message."
            : "Couldn't send your message. Please try again.",
        );
        return;
      }
      setDone(true);
      setName("");
      setEmail("");
      setBody("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Contact</h1>
      <p>
        Questions, partnerships, press, or anything else - send us a message. It goes straight to
        the admin inbox; we read everything. For product ideas or bug reports, use{" "}
        <a href="/suggest">Suggestions</a>.
      </p>
      {done && <div className="success">Thanks - your message is in. We&apos;ll be in touch.</div>}
      {error && <div className="error">{error}</div>}
      <form onSubmit={submit} className="stack">
        <label>
          <span>Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            autoFocus
          />
        </label>
        <label>
          <span>Your email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            required
          />
        </label>
        <label>
          <span>Message</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={1}
            maxLength={5000}
            required
          />
        </label>
        <button type="submit" disabled={busy || !name || !email || body.length < 1}>
          {busy ? "Sending…" : "Send message"}
        </button>
      </form>
    </>
  );
}
