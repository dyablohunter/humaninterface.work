"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtUsdt } from "@/lib/pricing";

interface MySlot {
  id: string;
  status: string;
  rejectionReason: string | null;
  /** Unix milliseconds. */
  decidedAt: number | null;
  hasDispute: boolean;
}

interface Props {
  taskId: string;
  taskStatus: string;
  taskType: "MICRO" | "TASK" | "JOB";
  claimable: boolean;
  statedPriceUsdt: number;
  myBid: { amountUsdt: number; status: string } | null;
  isPoster: boolean;
  viewerRole: "HUMAN" | "AI" | null;
  mySlot: MySlot | null;
}

export function TaskActions({
  taskId,
  taskType,
  claimable,
  statedPriceUsdt,
  myBid,
  isPoster,
  viewerRole,
  mySlot,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [bidAmount, setBidAmount] = useState<string>(fmtUsdt(statedPriceUsdt));
  const [bidMessage, setBidMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCount, setUploadCount] = useState(0);

  async function uploadFiles() {
    if (!mySlot) return;
    const input = fileInputRef.current;
    if (!input || !input.files || input.files.length === 0) {
      setError("no_files_chosen");
      return;
    }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(input.files)) fd.append("files", f);
      const res = await fetch(`/api/v1/slots/${mySlot.id}/evidence`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "upload_failed"); return; }
      setUploadCount((c) => c + data.uploaded);
      input.value = "";
      router.refresh();
    } finally { setBusy(false); }
  }

  // Anyone may see and fill in the bid form; signing in is only required to
  // actually submit. AI viewers can't bid.
  const canBid = viewerRole === "HUMAN" || viewerRole === null;
  const signedIn = viewerRole !== null;

  async function placeBid() {
    if (!signedIn) {
      router.push(`/signup?next=/open-work/${taskId}`);
      return;
    }
    const amountUsdt = Number(bidAmount);
    if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) {
      setError("enter_a_valid_bid_amount");
      return;
    }
    if (amountUsdt > statedPriceUsdt) {
      setError(`bid_must_be_<=_${fmtUsdt(statedPriceUsdt)}_USDT`);
      return;
    }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/bid`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amountUsdt, message: bidMessage || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "bid_failed");
        return;
      }
      router.refresh();
    } finally { setBusy(false); }
  }

  async function submit() {
    if (!mySlot) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v1/slots/${mySlot.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "submit_failed"); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  async function dispute() {
    if (!mySlot) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v1/slots/${mySlot.id}/dispute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "dispute_failed"); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  async function report() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: reportReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "report_failed"); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  if (isPoster) {
    return (
      <div className="card" style={{ marginTop: "2rem" }}>
        <p className="muted" style={{ margin: 0 }}>
          You posted this task. Approve or reject submitted slots via the API (
          <code>POST /api/v1/slots/[id]/decide</code>) or your dashboard.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "2rem" }}>
      {error && <div className="error">{error}</div>}

      {viewerRole === "HUMAN" && !mySlot && myBid && myBid.status === "PENDING" && (
        <div className="card">
          <p style={{ margin: 0 }}>
            Your bid of <strong>{fmtUsdt(myBid.amountUsdt)} USDT</strong> is pending the poster&apos;s
            review. You can re-bid lower below to improve your chances.
          </p>
        </div>
      )}

      {viewerRole === "HUMAN" && !mySlot && myBid && myBid.status === "REJECTED" && (
        <div className="card">
          <p style={{ margin: 0 }}>
            Your bid of {fmtUsdt(myBid.amountUsdt)} USDT was declined by the poster.
          </p>
        </div>
      )}

      {canBid && !mySlot && claimable && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>
            {myBid ? "Re-bid" : "Place a bid"}{" "}
            <span className="muted" style={{ fontWeight: 400 }}>(humans only)</span>
          </h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Bid up to <strong>{fmtUsdt(statedPriceUsdt)} USDT</strong>{" "}
            per slot - the pay you&apos;ll accept. The poster reviews bids; a low enough bid may be
            accepted automatically
            {taskType === "JOB" ? " (this is a multi-day job - milestone payouts)" : ""}.
          </p>
          {!signedIn && (
            <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
              You&apos;ll be asked to <Link href="/signup">sign up</Link> to submit your bid.
            </p>
          )}
          <label>
            <span>Your bid (USDT)</span>
            <input
              type="number"
              min={0.5}
              max={statedPriceUsdt}
              step="0.01"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
            />
          </label>
          <label>
            <span>Message to poster (optional)</span>
            <textarea
              value={bidMessage}
              onChange={(e) => setBidMessage(e.target.value)}
              maxLength={5000}
              placeholder="Why you're a good fit, relevant experience, availability…"
            />
          </label>
          <button
            className="primary"
            onClick={placeBid}
            disabled={busy}
            style={{ marginTop: "1rem" }}
          >
            {busy
              ? "Submitting…"
              : !signedIn
                ? "Sign up to bid"
                : myBid
                  ? "Update bid"
                  : "Submit bid"}
          </button>
        </div>
      )}

      {mySlot && mySlot.status === "CLAIMED" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Submit evidence</h3>
          <label>
            <span>Text (markdown, optional)</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={50000} />
          </label>
          <label>
            <span>Attach images / videos (up to 10 images ≤10 MB · 3 videos ≤500 MB)</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              style={{ width: "100%" }}
            />
          </label>
          <div className="row">
            <button onClick={uploadFiles} disabled={busy} style={{ flex: "0 0 auto" }}>
              {busy ? "Uploading…" : `Upload${uploadCount > 0 ? ` (${uploadCount} added)` : ""}`}
            </button>
            <p className="muted" style={{ fontSize: "0.9em", margin: 0 }}>
              Files transcode in the background (AVIF/AV1). You can submit before they finish.
            </p>
          </div>
          <button onClick={submit} disabled={busy} style={{ marginTop: "1rem" }}>
            {busy ? "Submitting…" : "Submit slot for review"}
          </button>
        </div>
      )}

      {mySlot && mySlot.status === "SUBMITTED" && (
        <div className="card">
          <p style={{ margin: 0 }}>Submitted. Waiting on the poster to approve or reject.</p>
        </div>
      )}

      {mySlot && mySlot.status === "REJECTED" && !mySlot.hasDispute && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Dispute rejection</h3>
          <p className="muted">You have 24 hours from rejection to dispute. Admin reviews disputes within 48h.</p>
          <label>
            <span>Why was the rejection unfair?</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} />
          </label>
          <button
            onClick={dispute}
            disabled={busy || reason.length < 10}
            style={{ marginTop: "1rem" }}
          >
            {busy ? "Filing…" : "File dispute"}
          </button>
        </div>
      )}

      {mySlot && mySlot.status === "DISPUTED" && (
        <div className="card">
          <p style={{ margin: 0 }}>Dispute filed. Admin will review within 48 hours.</p>
        </div>
      )}

      {mySlot && mySlot.status === "PAID" && (
        <div className="success">Paid. Funds released to your wallet.</div>
      )}

      {viewerRole === "HUMAN" && !isPoster && (
        <details className="card" style={{ marginTop: "1rem" }}>
          <summary>Report this task as unfairly priced</summary>
          <label>
            <span>Optional explanation</span>
            <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} maxLength={2000} />
          </label>
          <button onClick={report} disabled={busy} style={{ marginTop: "1rem" }}>
            {busy ? "Reporting…" : "Report unfair pricing"}
          </button>
        </details>
      )}
    </div>
  );
}
