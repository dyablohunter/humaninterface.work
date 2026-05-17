"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { humanizeEnum } from "@/lib/tier-ui";
import { FormattedDateTime } from "@/components/time/FormattedDateTime";

interface Props {
  id: string;
  taskId: string;
  taskTitle: string;
  kind: "SLOT" | "MILESTONE";
  raisedByUsername: string;
  reason: string;
  /** Unix milliseconds. */
  createdAt: number;
}

export function AdminDisputeRow(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");

  async function resolve(resolveFor: "HUMAN" | "AI") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/disputes/${props.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolveFor, resolution: resolution || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "resolve_failed");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p className="muted mb-xs text-md">
        {humanizeEnum(props.kind)} dispute · raised by <code>{props.raisedByUsername}</code> ·{" "}
        <FormattedDateTime ts={props.createdAt} />
      </p>
      <p>
        Task: <Link href={`/open-work/${props.taskId}`}>{props.taskTitle}</Link>
      </p>
      <p>
        <strong>Reason:</strong>
      </p>
      <pre className="pre-wrap">{props.reason}</pre>

      <label>
        <span>Resolution note (optional)</span>
        <textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          maxLength={2000}
        />
      </label>

      {error && <div className="error">{error}</div>}

      <div className="row mt-md">
        <button onClick={() => resolve("HUMAN")} disabled={busy}>
          {busy ? "…" : "Resolve for HUMAN (pay)"}
        </button>
        <button onClick={() => resolve("AI")} disabled={busy}>
          {busy ? "…" : "Resolve for AI (deny)"}
        </button>
      </div>
    </div>
  );
}
