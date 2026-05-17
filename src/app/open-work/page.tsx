import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/pricing";
import { TaskFilters } from "@/components/TaskFilters";
import { ViewToggle } from "@/components/ViewToggle";
import { InfiniteTaskFeed, type FeedTask } from "@/components/InfiniteTaskFeed";
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
    status?: string;
    category?: string;
    type?: string;
    urgency?: string;
    page?: string;
    q?: string;
    country?: string;
    city?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  const view: "grid" | "table" = params.view === "table" ? "table" : "grid";
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

  const pageSize = view === "table" ? 50 : 20;

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
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

  // Serialize Prisma rows to the shape the client component expects (and the API returns).
  const initialTasks: FeedTask[] = tasks.map((t) => {
    const bidAmounts = t.bids.map((b) => Number(b.amountUsdt));
    return {
      id: t.id,
      title: t.title,
      type: t.type,
      category: t.category,
      urgency: t.urgency,
      status: t.status,
      slotCount: t.slotCount,
      slotsOpen: t._count.slots,
      estimatedMinutes: t.estimatedMinutes,
      statedPriceUsdt: Number(t.statedPriceUsdt),
      country: t.country,
      city: t.city,
      latitude: t.latitude,
      longitude: t.longitude,
      biddingClosesAt: t.biddingClosesAt ? t.biddingClosesAt.getTime() : null,
      poster: t.poster.username,
      lowestBidUsdt: bidAmounts.length ? Math.min(...bidAmounts) : null,
      bidCount: bidAmounts.length,
    };
  });

  // Query string for the loader to fetch subsequent pages — strip view/page/pageSize.
  const filterQs = new URLSearchParams();
  if (params.status) filterQs.set("status", params.status);
  if (params.category) filterQs.set("category", params.category);
  if (params.type) filterQs.set("type", params.type);
  if (params.urgency) filterQs.set("urgency", params.urgency);
  if (params.country) filterQs.set("country", params.country);
  if (params.city) filterQs.set("city", params.city);
  if (q) filterQs.set("q", q);

  return (
    <>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
        <h1 style={{ margin: 0 }}>Open work</h1>
        <ViewToggle current={view} />
      </div>
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

      {initialTasks.length === 0 ? (
        <p>No work matches these filters.</p>
      ) : (
        <InfiniteTaskFeed
          key={`${view}|${filterQs.toString()}`}
          initialTasks={initialTasks}
          total={total}
          pageSize={pageSize}
          view={view}
          queryString={filterQs.toString()}
        />
      )}
    </>
  );
}
