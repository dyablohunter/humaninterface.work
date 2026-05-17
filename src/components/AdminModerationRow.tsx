"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminModerationRow({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: "ban" | "clear") {
    if (action === "ban" && !confirm("Permanently ban this account (pubkey + username)? Posts and funds are kept; this cannot be undone.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/moderation/${encodeURIComponent(id)}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row mt-sm">
      <button onClick={() => resolve("ban")} disabled={busy}>
        {busy ? "…" : "Ban + blocklist"}
      </button>
      <button onClick={() => resolve("clear")} disabled={busy}>
        {busy ? "…" : "Clear (false alarm)"}
      </button>
      {error && <span className="error error-inline">{error}</span>}
    </div>
  );
}
