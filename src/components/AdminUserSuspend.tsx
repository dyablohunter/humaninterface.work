"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminUserSuspend() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function call(suspended: boolean) {
    if (!username) {
      setError("username_required");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${encodeURIComponent(username)}/suspend`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suspended, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "failed");
        return;
      }
      setInfo(`${data.username}: suspended=${data.suspended}`);
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 className="mt-0">Suspend / unsuspend user</h3>
      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}
      <label>
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label>
        <span>Reason (audit log only, optional)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      </label>
      <div className="row mt-md">
        <button onClick={() => call(true)} disabled={busy}>
          {busy ? "…" : "Suspend"}
        </button>
        <button onClick={() => call(false)} disabled={busy}>
          {busy ? "…" : "Unsuspend"}
        </button>
      </div>
    </div>
  );
}
