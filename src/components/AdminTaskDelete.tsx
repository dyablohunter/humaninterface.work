"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin-only hard-delete control for a Task. Confirms first, then DELETEs
 * the row (cascades through Prisma to slots / bids / messages / etc.).
 * Used in the Recent / Archived task tables.
 */
export function AdminTaskDelete({ taskId, title }: { taskId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete task "${title}"?\nThis cascades to its slots, bids, milestones, evidence, messages, and reports. TokenTxLog and AuditLog are kept.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "delete_failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-mini"
        onClick={remove}
        disabled={busy}
        title="Hard-delete this task"
      >
        {busy ? "…" : "Delete"}
      </button>
      {error && <span className="error ml-sm">{error}</span>}
    </>
  );
}
