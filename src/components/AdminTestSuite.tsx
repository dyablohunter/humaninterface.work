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
          { id: "edit", label: "Edit task", content: <EditTaskPanel /> },
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
  "TAILORING","JEWELRY_AND_WATCH","POTTERY_CERAMICS","HANDWRITING_SAMPLE","LEATHERWORKING","GLASSBLOWING","BLACKSMITHING","MASONRY_STONEWORK",
  "CDL_DRIVING","HEAVY_EQUIPMENT","AIRCRAFT_PILOTING","MARINE_OPERATION","DRONE_COMMERCIAL","DRIVING_INSTRUCTION",
  "MUSICAL_INSTRUMENT","VOCAL_PERFORMANCE","ACTING_PERFORMANCE","VOICE_SAMPLE","LIVE_SOUND_ENGINEERING",
  // Sport & fitness
  "ATHLETIC_COACHING","PERSONAL_TRAINING","YOGA_INSTRUCTION","MARTIAL_ARTS_INSTRUCTION","SPORTS_OFFICIATING",
  "ILLUSTRATION","PHOTOGRAPHY","GRAPHIC_DESIGN","UX_UI_DESIGN","FLORAL_DESIGN","MAKEUP_ARTISTRY",
  "FICTION_WRITING","COPYWRITING","TECHNICAL_WRITING","TRANSLATION_RARE_LANGUAGE","LIVE_INTERPRETATION","SIGN_LANGUAGE_INTERPRETATION",
  "PROFESSIONAL_COOKING","BARTENDING","WINE_SOMMELIER","COFFEE_BARISTA","SENSORY_EVALUATION",
  "CHILDCARE","ELDERCARE","HOSPICE_PRESENCE","PET_CARE",
  "ACADEMIC_TUTORING","LANGUAGE_TUTORING","CONVERSATION_PARTNER",
  "LICENSED_THERAPY","PEER_SUPPORT","EXECUTIVE_COACHING",
  "LEGAL_ADVICE","NOTARY_WITNESS","COMPLIANCE_REVIEW","MODEL_OUTPUT_RATING",
  "PUBLIC_SPEAKING","SALES_NEGOTIATION","EVENT_HOSTING","PHONE_CALL_PLACING",
  "PRIVATE_SECURITY","WILDLAND_FIREFIGHTING","WILDERNESS_SAR","STUNT_PERFORMANCE",
  "WEDDING_OFFICIATION","FUNERAL_OFFICIATION","COURT_TESTIMONY","LIVE_VIDEO_CALL",
  // On-camera presence
  "PHOTO_MODEL","LIFE_DRAWING_MODEL","FILM_EXTRA",
  // Paid research participation
  "FOCUS_GROUP_PARTICIPATION","MEDICAL_TRIAL_PARTICIPATION",
  "CRISIS_CONSULTING","INVESTIGATIVE_RESEARCH","FORECASTING_ANALYSIS","UX_USABILITY_TESTING","BETA_TESTING","ACCESSIBILITY_TESTING","BUG_REPRODUCTION",
  "LIVESTOCK_HANDLING","WORKING_DOG_TRAINING","BEEKEEPING","FORAGING_MYCOLOGY","COMMERCIAL_FISHING","ARBORIST_TREE_CLIMBING","PHYSICAL_INSPECTION","FIELD_BIOLOGY","FIELD_GEOLOGY","ARCHAEOLOGICAL_FIELDWORK",
  "MASSAGE_THERAPY","TATTOO_ARTISTRY","HAIRSTYLING",
  "LOCAL_OBSERVATION","PHOTO_VERIFICATION","AUDIO_TRANSCRIPTION","DATA_LABELING","DELIVERY_RUNNER",
  // Digital / AI-fallback
  "SCREENSHOT_CAPTURE","VIDEO_RECORDING","AUDIO_RECORDING","MANUAL_WEB_TASK","MYSTERY_SHOPPING","HARDWARE_ASSEMBLY",
  // Catch-all
  "OTHER",
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
    biddingHours: 24,
    status: "OPEN",
    country: "",
    city: "",
    latitude: "",
    longitude: "",
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
      payload.biddingHours = Number(form.biddingHours);
      // Empty country = remote / location-agnostic. City without country is dropped server-side.
      payload.country = form.country || null;
      payload.city = form.country && form.city.trim() ? form.city.trim() : null;
      // Coords: must be paired. Client-side guard for better UX before the
      // server's zod refine rejects.
      const latStr = form.latitude.trim();
      const lngStr = form.longitude.trim();
      if ((latStr === "") !== (lngStr === "")) {
        setError("latitude_and_longitude_must_be_paired");
        return;
      }
      if (latStr !== "" && lngStr !== "") {
        const lat = Number(latStr);
        const lng = Number(lngStr);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          setError("invalid_latitude");
          return;
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
          setError("invalid_longitude");
          return;
        }
        payload.latitude = lat;
        payload.longitude = lng;
      } else {
        payload.latitude = null;
        payload.longitude = null;
      }

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
        <label className="flex-1">
          <span>Bidding window (hours)</span>
          <select
            value={form.biddingHours}
            onChange={(e) => set("biddingHours", Number(e.target.value))}
          >
            <option value={24}>24h</option>
            <option value={48}>48h</option>
          </select>
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
      <div className="row">
        <label className="flex-1">
          <span>Latitude (optional)</span>
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            value={form.latitude}
            placeholder="e.g. 37.7749"
            onChange={(e) => set("latitude", e.target.value)}
          />
        </label>
        <label className="flex-1">
          <span>Longitude (optional)</span>
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            value={form.longitude}
            placeholder="e.g. -122.4194"
            onChange={(e) => set("longitude", e.target.value)}
          />
        </label>
      </div>
      <p className="muted text-sm">
        Optional. If set, country/city become decorative — the precise location is the pin.
      </p>
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

/* -------------------------- Edit task -------------------------- */

interface LoadedTask {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: "LOW" | "NORMAL" | "URGENT" | "CRITICAL";
  privacy: "PUBLIC" | "PRIVATE";
  status: string;
  minReputation: number | null;
  deadlineAt: number | null;
  biddingHours: number;
  biddingClosesAt: number | null;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

function EditTaskPanel() {
  const router = useRouter();
  const [taskId, setTaskId] = useState("");
  const [loaded, setLoaded] = useState<LoadedTask | null>(null);
  const [form, setForm] = useState<LoadedTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function field<K extends keyof LoadedTask>(k: K, v: LoadedTask[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  async function load(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoaded(null);
    setForm(null);
    const id = taskId.trim();
    if (!id) {
      setError("missing_task_id");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/tasks/${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "load_failed");
        return;
      }
      const t: LoadedTask = {
        id: data.id,
        title: data.title,
        description: data.description,
        category: data.category,
        urgency: data.urgency,
        privacy: data.privacy,
        status: data.status,
        minReputation: data.minReputation,
        deadlineAt: data.deadlineAt,
        biddingHours: data.biddingHours,
        biddingClosesAt: data.biddingClosesAt,
        country: data.country,
        city: data.city,
        latitude: data.latitude,
        longitude: data.longitude,
      };
      setLoaded(t);
      setForm(t);
    } finally {
      setBusy(false);
    }
  }

  function diff(): Record<string, unknown> {
    if (!form || !loaded) return {};
    const out: Record<string, unknown> = {};
    if (form.title !== loaded.title) out.title = form.title;
    if (form.description !== loaded.description) out.description = form.description;
    if (form.category !== loaded.category) out.category = form.category;
    if (form.urgency !== loaded.urgency) out.urgency = form.urgency;
    if (form.privacy !== loaded.privacy) out.privacy = form.privacy;
    if (form.status !== loaded.status) out.status = form.status;
    if (form.minReputation !== loaded.minReputation) out.minReputation = form.minReputation;
    if (form.deadlineAt !== loaded.deadlineAt) out.deadlineAt = form.deadlineAt;
    if (form.biddingHours !== loaded.biddingHours) out.biddingHours = form.biddingHours;
    if ((form.country ?? "") !== (loaded.country ?? "")) out.country = form.country || null;
    if ((form.city ?? "") !== (loaded.city ?? "")) out.city = form.city || null;
    // Coords are a paired field — if either changed, send both. The server's
    // zod refine then enforces pair-or-null.
    if (form.latitude !== loaded.latitude || form.longitude !== loaded.longitude) {
      out.latitude = form.latitude;
      out.longitude = form.longitude;
    }
    return out;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !loaded) return;
    setError(null);
    setSuccess(null);
    const payload = diff();
    if (Object.keys(payload).length === 0) {
      setError("no_changes");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/tasks/${encodeURIComponent(form.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "update_failed");
        return;
      }
      setSuccess(`updated ${Object.keys(payload).join(", ")}`);
      setLoaded(form);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <form onSubmit={load} className="stack">
        <p className="muted text-sm">Paste a task ID to load its current values.</p>
        <label>
          <span>Task ID</span>
          <input
            type="text"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="e.g. clxxx0000abcd1234..."
            required
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" className="btn-primary mt-md" disabled={busy}>
          {busy ? "Loading…" : "Load task"}
        </button>
      </form>
    );
  }

  // Convert deadlineAt Unix ms ↔ "hours from now" for the input.
  const deadlineHours =
    form.deadlineAt !== null
      ? Math.max(0, Math.round((form.deadlineAt - Date.now()) / 3_600_000))
      : "";

  return (
    <form onSubmit={save} className="stack">
      <p className="muted text-sm">
        Editing <code>{form.id}</code> ·{" "}
        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setLoaded(null);
            setForm(null);
            setTaskId("");
            setError(null);
            setSuccess(null);
          }}
        >
          load a different task
        </button>
      </p>

      <div className="row">
        <label className="flex-1">
          <span>Status</span>
          <select value={form.status} onChange={(e) => field("status", e.target.value)}>
            <option value="OPEN">OPEN</option>
            <option value="PAUSED">PAUSED</option>
            <option value="PENDING_DEPOSIT">PENDING_DEPOSIT</option>
            <option value="FAIRNESS_FLAGGED">FAIRNESS_FLAGGED</option>
          </select>
        </label>
        <label className="flex-1">
          <span>Privacy</span>
          <select value={form.privacy} onChange={(e) => field("privacy", e.target.value as LoadedTask["privacy"])}>
            <option>PUBLIC</option>
            <option>PRIVATE</option>
          </select>
        </label>
        <label className="flex-1">
          <span>Urgency</span>
          <select value={form.urgency} onChange={(e) => field("urgency", e.target.value as LoadedTask["urgency"])}>
            <option>LOW</option>
            <option>NORMAL</option>
            <option>URGENT</option>
            <option>CRITICAL</option>
          </select>
        </label>
      </div>

      <label>
        <span>Title</span>
        <input value={form.title} onChange={(e) => field("title", e.target.value)} required />
      </label>
      <label>
        <span>Description</span>
        <textarea
          value={form.description}
          onChange={(e) => field("description", e.target.value)}
          required
        />
      </label>

      <div className="row">
        <label className="flex-2">
          <span>Category</span>
          <select value={form.category} onChange={(e) => field("category", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex-1">
          <span>Bidding window</span>
          <select
            value={form.biddingHours}
            onChange={(e) => field("biddingHours", Number(e.target.value))}
          >
            <option value={24}>24h</option>
            <option value={48}>48h</option>
          </select>
        </label>
      </div>

      <div className="row">
        <label className="flex-1">
          <span>Min reputation (0-1, blank for none)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={form.minReputation ?? ""}
            onChange={(e) =>
              field("minReputation", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
        <label className="flex-1">
          <span>Deadline (hours from now, blank for none)</span>
          <input
            type="number"
            min={0}
            value={deadlineHours}
            onChange={(e) => {
              const v = e.target.value;
              field(
                "deadlineAt",
                v === "" ? null : Date.now() + Number(v) * 3_600_000,
              );
            }}
          />
        </label>
      </div>

      <div className="row">
        <label className="flex-2">
          <span>Country</span>
          <select
            value={form.country ?? ""}
            onChange={(e) => {
              const next = e.target.value || null;
              setForm((f) => (f ? { ...f, country: next, city: next ? f.city : null } : f));
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
          <span>City</span>
          <input
            type="text"
            value={form.city ?? ""}
            maxLength={80}
            disabled={!form.country}
            placeholder={form.country ? "e.g. Portland" : "select a country first"}
            onChange={(e) => field("city", e.target.value || null)}
          />
        </label>
      </div>

      <div className="row">
        <label className="flex-1">
          <span>Latitude</span>
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            value={form.latitude ?? ""}
            placeholder="e.g. 37.7749"
            onChange={(e) =>
              field("latitude", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
        <label className="flex-1">
          <span>Longitude</span>
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            value={form.longitude ?? ""}
            placeholder="e.g. -122.4194"
            onChange={(e) =>
              field("longitude", e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
      </div>
      <p className="muted text-sm">
        Optional. If set, country/city become decorative — the precise location is the pin.
      </p>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="row">
        <button type="submit" className="btn-primary mt-md" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/open-work/${form.id}`} className="btn mt-md">
          Open in app
        </Link>
      </div>
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
        body: JSON.stringify({
          method,
          path,
          body: parsedBody,
          as,
          ...(as === "ai" ? { confirmTestAi: true } : {}),
        }),
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
        body: JSON.stringify({ method: "GET", path, as: "ai", confirmTestAi: true }),
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
