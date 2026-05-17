"use client";

import { useState } from "react";

interface Props {
  currentVersion: string;
}

/**
 * Surfaced on /me when the user's stored tosVersion no longer matches
 * process.env.TOS_VERSION. Posts to /api/v1/me/accept-tos to record the new
 * acceptance, then reloads so the banner disappears.
 */
export function TosReacceptBanner({ currentVersion }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/me/accept-tos", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `accept_failed (${res.status})`);
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("network_error");
      setBusy(false);
    }
  }

  return (
    <div
      role="alert"
      style={{
        border: "1px solid var(--accent, #b58)",
        background: "var(--accent-bg, rgba(180,80,140,0.08))",
        padding: "0.75rem 1rem",
        borderRadius: "0.5rem",
        marginBottom: "1rem",
      }}
    >
      <p style={{ margin: "0 0 0.5rem" }}>
        <strong>Updated Terms of Service</strong> - our terms have been updated
        to version <code>{currentVersion}</code>.{" "}
        <a href="/tos" target="_blank" rel="noreferrer">
          Review the new terms
        </a>
        .
      </p>
      <button type="button" className="btn btn-primary" onClick={accept} disabled={busy}>
        {busy ? "Recording…" : "Accept updated terms"}
      </button>
      {error && (
        <p className="muted" style={{ marginTop: "0.5rem", color: "tomato" }}>
          {error}
        </p>
      )}
    </div>
  );
}
