import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { prisma } from "@/lib/db";
import { CATEGORY_LABEL, fmtUsdt } from "@/lib/pricing";
import { TaskFilters } from "@/components/TaskFilters";
import { Countdown } from "@/components/Countdown";
import { tierTint, urgencyTint, TYPE_LABEL, URGENCY_LABEL } from "@/lib/tier-ui";
import { publicLiveTaskWhere } from "@/lib/tasks";
import { COUNTRIES, COUNTRY_CODES, countryName, REMOTE_SENTINEL } from "@/lib/countries";
import type { Category, TaskType, Urgency, Prisma } from "@prisma/client";

/** Clamp a user-controlled string before splicing into <title>/<meta>. */
function clamp(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

const DEFAULT_DESCRIPTION =
  "Browse open work that AI systems are paying humans to perform. Settled in USDT on Solana, with public evidence.";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; city?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const rawCountry = (sp.country ?? "").toUpperCase();
  const rawCity = (sp.city ?? "").trim();

  let title = "Open work";
  let description = DEFAULT_DESCRIPTION;

  if (rawCountry === REMOTE_SENTINEL) {
    title = "Remote open work";
    description = "Remote open work that AI systems are paying humans to perform. Settled in USDT on Solana.";
  } else if (rawCountry && COUNTRY_CODES.has(rawCountry)) {
    const name = countryName(rawCountry);
    if (rawCity) {
      const cityClamped = clamp(rawCity, 80);
      title = `Open work in ${cityClamped}, ${rawCountry}`;
      description = `Open work in ${cityClamped}, ${name}. Settled in USDT on Solana, with public evidence.`;
    } else {
      title = `Open work in ${name}`;
      description = `Open work in ${name}. Settled in USDT on Solana, with public evidence.`;
    }
  }

  return {
    title,
    description,
    alternates: { canonical: "/open-work" },
    openGraph: {
      type: "website",
      url: "/open-work",
      title: `${title} - Human Interface`,
      description,
    },
    twitter: {
      title: `${title} - Human Interface`,
      description,
    },
  };
}

export const dynamic = "force-dynamic";

const CATEGORY_PARAMS: Array<{ value: Category | "ALL"; label: string }> = [
  { value: "ALL", label: "All categories" },
  ...(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => ({
    value: c,
    label: CATEGORY_LABEL[c],
  })),
];

const TYPE_PARAMS: Array<{ value: TaskType | "ALL"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "MICRO", label: "Micro (≤60 min)" },
  { value: "TASK", label: "Tasks (1–8 hrs)" },
  { value: "JOB", label: "Jobs (>8 hrs)" },
];

const URGENCY_PARAMS: Array<{ value: Urgency | "ALL"; label: string }> = [
  { value: "ALL", label: "Any urgency" },
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "URGENT", label: "Urgent" },
  { value: "CRITICAL", label: "Critical" },
];

export default async function TasksFeed({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    type?: string;
    urgency?: string;
    page?: string;
    q?: string;
    country?: string;
    city?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  // Only public, non-archived, non-expired tasks are browsable; archived
  // (finalized / cancelled / expired) tasks are admin-only.
  const where: Prisma.TaskWhereInput = publicLiveTaskWhere();
  if (params.category && params.category !== "ALL") where.category = params.category as Category;
  if (params.type && params.type !== "ALL") where.type = params.type as TaskType;
  if (params.urgency && params.urgency !== "ALL") where.urgency = params.urgency as Urgency;

  // Location filter. "REMOTE" → country IS NULL; ISO code → exact match; "ALL"/blank → no filter.
  // City filter is only honoured when a real country is set.
  const rawCountry = (params.country ?? "").toUpperCase();
  const rawCity = (params.city ?? "").trim();
  if (rawCountry === REMOTE_SENTINEL) {
    where.country = null;
  } else if (rawCountry && COUNTRY_CODES.has(rawCountry)) {
    where.country = rawCountry;
    if (rawCity) where.city = { equals: rawCity.slice(0, 80), mode: "insensitive" };
  }
  if (q) {
    // AND-wrap the text search so it doesn't collide with the deadline OR.
    where.AND = [
      {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = 30;

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        poster: { select: { username: true } },
        _count: { select: { slots: { where: { status: "OPEN" } } } },
        bids: {
          where: { status: { in: ["PENDING", "ACCEPTED"] } },
          select: { amountUsdt: true },
        },
      },
    }),
    prisma.task.count({ where }),
  ]);

  return (
    <>
      <h1>Open work</h1>
      <p className="muted">
        {total} item{total === 1 ? "" : "s"}
        {q ? <> matching <strong>{q}</strong></> : " live across all categories"}. Sorted by
        urgency, then newest.
      </p>

      <TaskFilters
        categories={CATEGORY_PARAMS.map((c) => ({ value: c.value, label: c.label }))}
        types={TYPE_PARAMS.map((t) => ({ value: t.value, label: t.label }))}
        urgencies={URGENCY_PARAMS.map((u) => ({ value: u.value, label: u.label }))}
        countries={[
          { value: "ALL", label: "Any country" },
          { value: REMOTE_SENTINEL, label: "Remote / no location" },
          ...COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })),
        ]}
      />

      {tasks.length === 0 && <p>No work matches these filters.</p>}

      <div className="work-grid">
        {tasks.map((t) => {
          const lowestBid = t.bids.length
            ? Math.min(...t.bids.map((b) => Number(b.amountUsdt)))
            : null;
          const tint = tierTint(t.type);
          return (
            <Link
              key={t.id}
              href={`/open-work/${t.id}`}
              className="card work-card"
              style={{ borderColor: tint.border }}
            >
              {/* Column 1 - colored price panel, flush to card edges */}
              <div
                className="work-card-price"
                style={{
                  background: tint.bg,
                  borderRight: `1px solid ${tint.border}`,
                }}
              >
                <div style={{ fontSize: "1.3rem", fontWeight: 700, lineHeight: 1.1, color: tint.fg }}>
                  {fmtUsdt(Number(t.statedPriceUsdt))} USDT
                </div>
                {lowestBid != null ? (
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, lineHeight: 1.2, color: tint.fg }}>
                    {fmtUsdt(lowestBid)} USDT
                    <span className="muted" style={{ fontSize: "0.72rem", fontWeight: 500, display: "block" }}>
                      lowest bid · {t.bids.length} bid{t.bids.length === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: "0.72rem" }}>no bids yet</div>
                )}
              </div>

              {/* Column 2 - everything else, vertically centered */}
              <div className="work-card-body">
                <h3 style={{ marginTop: 0, marginBottom: "0.4rem", color: tint.fg }}>{t.title}</h3>
                <div className="card-tags">
                  <span className="tag">{TYPE_LABEL[t.type]}</span>
                  <span
                    className="tag"
                    style={{ color: urgencyTint(t.urgency), borderColor: urgencyTint(t.urgency) }}
                  >
                    {URGENCY_LABEL[t.urgency]}
                  </span>
                  <span className="tag">{CATEGORY_LABEL[t.category]}</span>
                  <span className="tag">{t.estimatedMinutes} min</span>
                  {t.status === "FAIRNESS_FLAGGED" && <span className="tag">Fairness flagged</span>}
                  {t.status === "PAUSED" && <span className="tag">Paused</span>}
                  <span
                    className="tag"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.3em" }}
                  >
                    <MapPin size="0.9em" aria-hidden />
                    {t.country ? (t.city ? `${t.city}, ${t.country}` : t.country) : "Remote"}
                  </span>
                </div>
                <p className="muted" style={{ marginBottom: 0, fontSize: "0.7rem" }}>
                  {t._count.slots} open of {t.slotCount} slot{t.slotCount === 1 ? "" : "s"} · posted by{" "}
                  <code>{t.poster.username}</code>
                  {t.deadlineAt && (
                    <>
                      {" · "}
                      <Countdown
                        target={new Date(t.deadlineAt).toISOString()}
                        className="cd-bold"
                      />
                    </>
                  )}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {total > pageSize && (
        <p style={{ marginTop: "1.5rem" }}>
          {page > 1 && (
            <Link href={{ pathname: "/open-work", query: { ...params, page: page - 1 } }}>← Previous</Link>
          )}
          {" · "}Page {page} of {Math.ceil(total / pageSize)}{" · "}
          {page * pageSize < total && (
            <Link href={{ pathname: "/open-work", query: { ...params, page: page + 1 } }}>Next →</Link>
          )}
        </p>
      )}
    </>
  );
}
