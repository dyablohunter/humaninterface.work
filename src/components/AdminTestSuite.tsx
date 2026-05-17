"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SwitchView } from "@/components/SwitchView";
import { COUNTRIES } from "@/lib/countries";

interface Props {
  testAiUsername: string;
  testAiPubkey: string | null;
}

/**
 * Admin Testing tab. A small API exerciser for the AI ↔ human delegation
 * flow: post mock tasks, hit any /api/v1 endpoint signed as the test AI (or
 * with the admin cookie), check task status, and send a small USDT payout.
 *
 * Everything is gated to admins server-side. The test AI keypair is stored
 * in `.env` (TEST_AI_*) - dev / staging only.
 */
export function AdminTestSuite({ testAiUsername, testAiPubkey }: Props) {
  return (
    <>
      <p className="muted text-md">
        Test AI: <code>{testAiUsername}</code>
        {testAiPubkey ? (
          <>
            {" · "}
            <code className="text-sm">{testAiPubkey.slice(0, 12)}…</code>
          </>
        ) : (
          <>
            {" - "}
            <strong>TEST_AI_* not configured in .env</strong>
          </>
        )}
      </p>
      <SwitchView
        options={[
          { id: "task", label: "Create task", content: <CreateTaskPanel /> },
          { id: "scenarios", label: "Scenarios", content: <ScenariosPanel /> },
          { id: "call", label: "API console", content: <ApiConsolePanel /> },
          { id: "status", label: "Status check", content: <StatusCheckPanel /> },
          { id: "worker", label: "Workers", content: <WorkerPanel /> },
          { id: "moderation", label: "Moderation", content: <ModerationPanel /> },
          { id: "solana", label: "Solana", content: <SolanaPanel /> },
          { id: "tx", label: "TX lookup", content: <TxLookupPanel /> },
        ]}
      />
    </>
  );
}

/* -------------------------- Create task -------------------------- */

const CATEGORIES: string[] = [
  "MICROSURGERY","SURGERY_GENERAL","DENTAL_PROCEDURES","EMERGENCY_MEDICAL",
  "PLUMBING","ELECTRICAL","HVAC","CARPENTRY","AUTO_MECHANIC","WELDING_FABRICATION","LOCKSMITHING","APPLIANCE_REPAIR",
  "TAILORING","JEWELRY_AND_WATCH","POTTERY_CERAMICS",
  "CDL_DRIVING","HEAVY_EQUIPMENT","AIRCRAFT_PILOTING","MARINE_OPERATION","DRONE_COMMERCIAL",
  "MUSICAL_INSTRUMENT","VOCAL_PERFORMANCE","ACTING_PERFORMANCE",
  "ILLUSTRATION","PHOTOGRAPHY","GRAPHIC_DESIGN","UX_UI_DESIGN",
  "FICTION_WRITING","COPYWRITING","TECHNICAL_WRITING","TRANSLATION_RARE_LANGUAGE",
  "PROFESSIONAL_COOKING","BARTENDING","WINE_SOMMELIER","COFFEE_BARISTA",
  "CHILDCARE","ELDERCARE","HOSPICE_PRESENCE","PET_CARE",
  "ACADEMIC_TUTORING","LANGUAGE_TUTORING","CONVERSATION_PARTNER",
  "LICENSED_THERAPY","PEER_SUPPORT","EXECUTIVE_COACHING",
  "LEGAL_ADVICE","NOTARY_WITNESS","COMPLIANCE_REVIEW",
  "PUBLIC_SPEAKING","SALES_NEGOTIATION","EVENT_HOSTING",
  "PRIVATE_SECURITY","WILDLAND_FIREFIGHTING","WILDERNESS_SAR","STUNT_PERFORMANCE",
  "WEDDING_OFFICIATION","FUNERAL_OFFICIATION","COURT_TESTIMONY",
  "CRISIS_CONSULTING","INVESTIGATIVE_RESEARCH","FORECASTING_ANALYSIS",
  "LIVESTOCK_HANDLING","WORKING_DOG_TRAINING","BEEKEEPING","FORAGING_MYCOLOGY","COMMERCIAL_FISHING","ARBORIST_TREE_CLIMBING",
  "MASSAGE_THERAPY","TATTOO_ARTISTRY","HAIRSTYLING",
  "LOCAL_OBSERVATION","PHOTO_VERIFICATION","AUDIO_TRANSCRIPTION","DATA_LABELING","DELIVERY_RUNNER",
];

function CreateTaskPanel() {
  const router = useRouter();
  const [form, setForm] = useState({
    type: "MICRO",
    title: "Test task: photo verification",
    description: "Take 3 photos of the storefront sign and upload them.",
    category: "PHOTO_VERIFICATION",
    urgency: "NORMAL",
    privacy: "PUBLIC",
    slotCount: 1,
    estimatedMinutes: 15,
    statedPriceUsdt: 5,
    instantAcceptUsdt: 3,
    minReputation: "",
    deadlineHours: "",
    status: "OPEN",
    country: "",
    city: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ taskId: string; status: string; posterUsername: string } | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payload: Record<string, unknown> = {
        type: form.type,
        title: form.title,
        description: form.description,
        category: form.category,
        urgency: form.urgency,
        privacy: form.privacy,
        slotCount: Number(form.slotCount),
        estimatedMinutes: Number(form.estimatedMinutes),
        statedPriceUsdt: Number(form.statedPriceUsdt),
        instantAcceptUsdt: Number(form.instantAcceptUsdt),
        status: form.status,
      };
      if (form.minReputation !== "") payload.minReputation = Number(form.minReputation);
      if (form.deadlineHours !== "") payload.deadlineHours = Number(form.deadlineHours);
      // Empty country = remote / location-agnostic. City without country is dropped server-side.
      payload.country = form.country || null;
      payload.city = form.country && form.city.trim() ? form.city.trim() : null;

      const res = await fetch("/api/v1/admin/test-task", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "create_failed");
        return;
      }
      setResult(data);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="row">
        <label className="flex-1">
          <span>Type</span>
          <select value={form.type} onChange={(e) => set("type", e.target.value)}>
            <option value="MICRO">MICRO (≤60 min)</option>
            <option value="TASK">TASK (1–8 hr)</option>
            <option value="JOB">JOB (&gt;8 hr)</option>
          </select>
        </label>
        <label className="flex-1">
          <span>Status</span>
          <select value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="OPEN">OPEN (skip deposit)</option>
            <option value="PENDING_DEPOSIT">PENDING_DEPOSIT</option>
          </select>
        </label>
      </div>
      <label>
        <span>Title</span>
        <input value={form.title} onChange={(e) => set("title", e.target.value)} required />
      </label>
      <label>
        <span>Description</span>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          required
        />
      </label>
      <div className="row">
        <label className="flex-2">
          <span>Category</span>
          <select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span>Urgency</span>
          <select value={form.urgency} onChange={(e) => set("urgency", e.target.value)}>
            <option>LOW</option>
            <option>NORMAL</option>
            <option>URGENT</option>
            <option>CRITICAL</option>
          </select>
        </label>
        <label className="flex-1">
          <span>Privacy</span>
          <select value={form.privacy} onChange={(e) => set("privacy", e.target.value)}>
            <option>PUBLIC</option>
            <option>PRIVATE</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label className="flex-1">
          <span>Slots</span>
          <input
            type="number"
            min={1}
            max={20}
            value={form.slotCount}
            onChange={(e) => set("slotCount", Number(e.target.value))}
          />
        </label>
        <label className="flex-1">
          <span>Estimated minutes</span>
          <input
            type="number"
            min={1}
            value={form.estimatedMinutes}
            onChange={(e) => set("estimatedMinutes", Number(e.target.value))}
          />
        </label>
        <label className="flex-1">
          <span>Stated USDT</span>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={form.statedPriceUsdt}
            onChange={(e) => set("statedPriceUsdt", Number(e.target.value))}
          />
        </label>
        <label className="flex-1">
          <span>Instant USDT</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.instantAcceptUsdt}
            onChange={(e) => set("instantAcceptUsdt", Number(e.target.value))}
          />
        </label>
      </div>
      <div className="row">
        <label className="flex-1">
          <span>Min reputation (0-1, optional)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.minReputation}
            onChange={(e) => set("minReputation", e.target.value)}
          />
        </label>
        <label className="flex-1">
          <span>Deadline (hours from now, optional)</span>
          <input
            type="number"
            min={0}
            value={form.deadlineHours}
            onChange={(e) => set("deadlineHours", e.target.value)}
          />
        </label>
      </div>
      <div className="row">
        <label className="flex-2">
          <span>Country (optional)</span>
          <select
            value={form.country}
            onChange={(e) => {
              const next = e.target.value;
              setForm((f) => ({ ...f, country: next, city: next ? f.city : "" }));
            }}
          >
            <option value="">Remote / no specific location</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>
        <label className="flex-2">
          <span>City (optional)</span>
          <input
            type="text"
            value={form.city}
            maxLength={80}
            disabled={!form.country}
            placeholder={form.country ? "e.g. Portland" : "select a country first"}
            onChange={(e) => set("city", e.target.value)}
          />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="success">
          Created <code>{result.taskId}</code> ({result.status}) as{" "}
          <code>{result.posterUsername}</code> ·{" "}
          <Link href={`/open-work/${result.taskId}`}>open in app</Link>
        </div>
      )}
      <button type="submit" className="btn-primary mt-md" disabled={busy}>
        {busy ? "Creating…" : "Create test task"}
      </button>
    </form>
  );
}

/* -------------------------- API console -------------------------- */

function ApiConsolePanel() {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/api/v1/heartbeat");
  const [body, setBody] = useState("");
  const [as, setAs] = useState<"ai" | "admin">("ai");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let parsedBody: unknown = undefined;
      if (body.trim()) {
        try { parsedBody = JSON.parse(body); }
        catch { setError("body_is_not_valid_json"); return; }
      }
      const res = await fetch("/api/v1/admin/test-call", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, path, body: parsedBody, as }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "call_failed");
        return;
      }
      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="stack">
      <div className="row">
        <label className="flex-1">
          <span>Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>GET</option>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
            <option>DELETE</option>
          </select>
        </label>
        <label className="flex-3">
          <span>Path</span>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/api/v1/tasks/cm.../bid"
          />
        </label>
        <label className="flex-1">
          <span>Auth as</span>
          <select value={as} onChange={(e) => setAs(e.target.value as "ai" | "admin")}>
            <option value="ai">Test AI (signed)</option>
            <option value="admin">Admin cookie</option>
          </select>
        </label>
      </div>
      <label>
        <span>Body (JSON, leave blank for none)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder='{ "title": "..." }'
          className="mono"
        />
      </label>
      {error && <div className="error">{error}</div>}
      <button type="submit" className="btn-primary mt-md" disabled={busy}>
        {busy ? "Sending…" : "Send"}
      </button>
      <ResultBox result={result} />
    </form>
  );
}

/* -------------------------- Status check -------------------------- */

function StatusCheckPanel() {
  const [kind, setKind] = useState<"task" | "thread" | "slot">("task");
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const path =
        kind === "task"
          ? `/api/v1/tasks/${encodeURIComponent(id)}`
          : kind === "thread"
            ? `/api/v1/tasks/${encodeURIComponent(id)}/messages`
            : `/api/v1/tasks/${encodeURIComponent(id)}/bids`;
      const res = await fetch("/api/v1/admin/test-call", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "GET", path, as: "ai" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "lookup_failed");
        return;
      }
      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={check} className="stack">
      <div className="row">
        <label className="flex-1">
          <span>What</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="task">Task detail</option>
            <option value="thread">Message thread summaries</option>
            <option value="slot">Bids on task</option>
          </select>
        </label>
        <label className="flex-3">
          <span>Task ID</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="cm..." required />
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <button type="submit" className="btn-primary mt-md" disabled={busy || !id}>
        {busy ? "Checking…" : "Check"}
      </button>
      <ResultBox result={result} />
    </form>
  );
}

/* -------------------------- shared result box -------------------------- */

function ResultBox({ result }: { result: unknown }) {
  if (result == null) return null;
  return <pre className="json-output">{JSON.stringify(result, null, 2)}</pre>;
}

async function adminPost(path: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

/* -------------------------- Workers -------------------------- */

function WorkerPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function run(job: "purge" | "moderation-recheck" | "transcode") {
    setBusy(job);
    setResult(null);
    try {
      const { data } = await adminPost("/api/v1/admin/test-worker", { job });
      setResult(data);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <p className="muted text-md">
        Fires the PM2 worker loops once, synchronously, and returns the count of
        rows it touched. Use after back-dating a deadline (Force state →
        Expire), or after planting a <code>ModerationReview</code>.
      </p>
      <div className="btn-row">
        <button className="btn" onClick={() => run("purge")} disabled={!!busy}>
          {busy === "purge" ? "Running…" : "Run purgeStale()"}
        </button>
        <button
          className="btn"
          onClick={() => run("moderation-recheck")}
          disabled={!!busy}
        >
          {busy === "moderation-recheck" ? "Running…" : "Run recheckPendingModeration()"}
        </button>
        <button className="btn" onClick={() => run("transcode")} disabled={!!busy}>
          {busy === "transcode" ? "Running…" : "Run transcodePending()"}
        </button>
      </div>
      <ResultBox result={result} />
    </div>
  );
}

/* -------------------------- Moderation injection -------------------------- */

const MOD_KINDS = [
  "TASK_POST","DECISION_NOTE","HUMAN_MESSAGE","EVIDENCE_TEXT","EVIDENCE_MEDIA","PETITION",
] as const;
const MOD_STATUSES = ["PENDING","CLEARED","ACTIONED","MANUAL"] as const;

function ModerationPanel() {
  const [username, setUsername] = useState("");
  const [kind, setKind] = useState<typeof MOD_KINDS[number]>("TASK_POST");
  const [content, setContent] = useState("admin-test injection");
  const [reviewStatus, setReviewStatus] = useState<typeof MOD_STATUSES[number]>("MANUAL");
  const [reviewId, setReviewId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function call(kindOp: string, body: unknown) {
    setBusy(kindOp);
    setResult(null);
    try {
      const { data } = await adminPost("/api/v1/admin/test-moderation", body);
      setResult(data);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <p className="muted text-md">
        Reach every branch of the content-safety pipeline without DeepSeek
        cooperation: plant <code>ModerationReview</code> rows, move them
        between statuses, or force-ban any user.
      </p>

      <div className="card">
        <strong className="text-md">Create review row</strong>
        <div className="row mt-sm">
          <label className="flex-2">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="flex-1">
            <span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof MOD_KINDS[number])}>
              {MOD_KINDS.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="flex-1">
            <span>Status</span>
            <select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value as typeof MOD_STATUSES[number])}
            >
              {MOD_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label>
          <span>Content</span>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
        </label>
        <button
          className="btn mt-md"
          disabled={!username || !content || !!busy}
          onClick={() =>
            call("create-review", {
              action: "create-review",
              username,
              kind,
              content,
              status: reviewStatus,
            })
          }
        >
          {busy === "create-review" ? "…" : "Create review row"}
        </button>
      </div>

      <div className="card">
        <strong className="text-md">Move existing review</strong>
        <div className="row mt-sm">
          <label className="flex-2">
            <span>Review row ID</span>
            <input value={reviewId} onChange={(e) => setReviewId(e.target.value)} />
          </label>
          <label className="flex-1">
            <span>Set status</span>
            <select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value as typeof MOD_STATUSES[number])}
            >
              {MOD_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <button
          className="btn mt-md"
          disabled={!reviewId || !!busy}
          onClick={() =>
            call("set-review-status", {
              action: "set-review-status",
              id: reviewId,
              status: reviewStatus,
            })
          }
        >
          {busy === "set-review-status" ? "…" : "Set status"}
        </button>
      </div>

      <div className="card">
        <strong className="text-md">Force-ban</strong>
        <label>
          <span>Username (force banAndBlockAi)</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <button
          className="btn mt-md"
          disabled={!username || !!busy}
          onClick={() => call("ban", { action: "ban-user", username })}
        >
          {busy === "ban" ? "…" : "Ban user"}
        </button>
      </div>

      <ResultBox result={result} />
    </div>
  );
}

/* -------------------------- Solana visibility -------------------------- */

function SolanaPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function load() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/admin/test-solana", { credentials: "include" });
      setResult(await res.json());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="muted text-md">
        SOL gas + USDT balances of the escrow and test-AI wallets.
        Use this to confirm escrow has gas and USDT before running a scenario.
      </p>
      <button className="btn-primary" onClick={load} disabled={busy}>
        {busy ? "Loading…" : "Fetch Solana snapshot"}
      </button>
      <ResultBox result={result} />
    </div>
  );
}

/* -------------------------- TX lookup -------------------------- */

function TxLookupPanel() {
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function look(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const { data } = await adminPost("/api/v1/admin/test-verify-tx", { signature });
      setResult(data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={look} className="stack">
      <p className="muted text-md">
        Runs the same <code>fetchUsdtTransfer</code> helper that{" "}
        <code>/confirm-deposit</code> uses. Shows the parsed memo, sender owner,
        recipient owner, USDT amount, and block time of any Solana signature.
      </p>
      <label>
        <span>Signature</span>
        <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="base58 signature" required />
      </label>
      <button className="btn-primary mt-md" type="submit" disabled={busy || !signature}>
        {busy ? "Looking up…" : "Inspect"}
      </button>
      <ResultBox result={result} />
    </form>
  );
}

/* -------------------------- Scenarios -------------------------- */

function ScenariosPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function run(scenario: "deadline-expiry-refund" | "cancel-task" | "moderation-ban") {
    setBusy(scenario);
    setResult(null);
    try {
      const { data } = await adminPost("/api/v1/admin/test-scenario", { scenario });
      setResult(data);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <p className="muted text-md">
        One-button multi-step flows that exercise time- and worker-dependent
        logic without needing a human. Each returns a transcript of the steps
        and the final state.
      </p>
      <div className="btn-row">
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => run("deadline-expiry-refund")}
          title="Create a task, back-date its deadline, run purgeStale(), inspect refund"
        >
          {busy === "deadline-expiry-refund" ? "Running…" : "Deadline expiry → refund"}
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => run("cancel-task")}
          title="Create a task and cancel it via signed AI /cancel"
        >
          {busy === "cancel-task" ? "Running…" : "Refund by cancel"}
        </button>
        <button
          className="btn"
          disabled={!!busy}
          onClick={() => run("moderation-ban")}
          title="Create a throwaway AI, banAndBlockAi(), assert blocklist"
        >
          {busy === "moderation-ban" ? "Running…" : "Moderation ban"}
        </button>
      </div>
      <ResultBox result={result} />
    </div>
  );
}
