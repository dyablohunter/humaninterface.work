/**
 * Profile statistics aggregation for /u/[username].
 *
 * Two flavours: `getHumanStats` and `getAiStats`. Both return purely numeric
 * aggregates over all tasks/slots (public + private) — they leak no content,
 * just counts. For per-task lists where content WOULD leak, use
 * `getRecentPublicActivity` which filters to PUBLIC tasks only.
 *
 * Counters on HumanProfile (microPaid/taskPaid/jobPaid/rejectedCount/disputed)
 * are the source of truth for headline reputation. Other figures (earnings,
 * timings, category rollups) are computed from Slot/Task/Milestone rows.
 *
 * Mean (not median) is used for "average completion time" — see
 * AVG_MODE_NOTE. Switching later means swapping one helper.
 */
import { prisma } from "./db";
import { toUnix } from "./time";
import type { Category, TaskStatus, TaskType } from "@prisma/client";

// AVG_MODE_NOTE: mean is sensitive to a single very-slow outlier, but it's
// O(1) to compute in SQL and avoids loading every duration into memory.
// Median would require fetching all durations or running a percentile_cont
// query; defer until there's a reason.
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function minutesBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 60_000;
}

export interface HumanStats {
  reputation: { paid: number; rejected: number; score: number };
  breakdown: {
    microPaid: number;
    taskPaid: number;
    jobPaid: number;
    rejectedCount: number;
    disputed: number;
  };
  earningsUsdt: number;
  avgCompletionMinutes: { micro: number | null; task: number | null; job: number | null };
  fastestCompletionMinutes: number | null;
  topCategories: Array<{ category: Category; paidCount: number }>;
  activeSlots: number;
  /** Unix milliseconds. */
  joinedAt: number;
  /** Unix milliseconds. */
  lastSeenAt: number | null;
}

export async function getHumanStats(userId: string): Promise<HumanStats> {
  const [user, profile, paidSlotsForTiming, paidMilestoneTotal, activeCount] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { createdAt: true, lastSeenAt: true },
      }),
      prisma.humanProfile.findUnique({ where: { userId } }),
      // Pull only fields needed for timing + category + earnings rollup.
      prisma.slot.findMany({
        where: { humanId: userId, status: "PAID" },
        select: {
          awardedUsdt: true,
          claimedAt: true,
          decidedAt: true,
          task: { select: { type: true, category: true } },
        },
      }),
      prisma.milestone.aggregate({
        where: { slot: { humanId: userId }, status: "PAID" },
        _sum: { perMilestoneUsdt: true },
      }),
      prisma.slot.count({
        where: { humanId: userId, status: { in: ["CLAIMED", "SUBMITTED"] } },
      }),
    ]);

  const microPaid = profile?.microPaid ?? 0;
  const taskPaid = profile?.taskPaid ?? 0;
  const jobPaid = profile?.jobPaid ?? 0;
  const rejectedCount = profile?.rejectedCount ?? 0;
  const disputed = profile?.disputed ?? 0;

  const paid = microPaid + taskPaid + jobPaid;
  const rejected = rejectedCount;
  const denom = paid + rejected;
  const score = denom === 0 ? 1 : Math.round((paid / denom) * 1000) / 1000;

  // Earnings: paid slots awardedUsdt + paid milestones perMilestoneUsdt.
  let earningsUsdt = 0;
  for (const s of paidSlotsForTiming) {
    if (s.awardedUsdt != null) earningsUsdt += Number(s.awardedUsdt);
  }
  if (paidMilestoneTotal._sum.perMilestoneUsdt) {
    earningsUsdt += Number(paidMilestoneTotal._sum.perMilestoneUsdt);
  }

  // Completion time per tier: decidedAt - claimedAt in minutes.
  const byTier: Record<TaskType, number[]> = { MICRO: [], TASK: [], JOB: [] };
  let fastest: number | null = null;
  for (const s of paidSlotsForTiming) {
    if (!s.claimedAt || !s.decidedAt) continue;
    const m = minutesBetween(s.decidedAt, s.claimedAt);
    if (m < 0) continue;
    byTier[s.task.type].push(m);
    if (fastest === null || m < fastest) fastest = m;
  }

  // Top categories by paid count.
  const catCount = new Map<Category, number>();
  for (const s of paidSlotsForTiming) {
    catCount.set(s.task.category, (catCount.get(s.task.category) ?? 0) + 1);
  }
  const topCategories = [...catCount.entries()]
    .map(([category, paidCount]) => ({ category, paidCount }))
    .sort((a, b) => b.paidCount - a.paidCount)
    .slice(0, 5);

  return {
    reputation: { paid, rejected, score },
    breakdown: { microPaid, taskPaid, jobPaid, rejectedCount, disputed },
    earningsUsdt,
    avgCompletionMinutes: {
      micro: mean(byTier.MICRO),
      task: mean(byTier.TASK),
      job: mean(byTier.JOB),
    },
    fastestCompletionMinutes: fastest,
    topCategories,
    activeSlots: activeCount,
    joinedAt: user.createdAt.getTime(),
    lastSeenAt: toUnix(user.lastSeenAt),
  };
}

export interface AiStats {
  tasksPosted: {
    total: number;
    public: number;
    private: number;
    live: number;
    completed: number;
    cancelled: number;
    purged: number;
  };
  slotsAwarded: number;
  slotsRejected: number;
  totalPaidOutUsdt: number;
  totalEscrowedUsdt: number;
  avgTimeToFundMinutes: number | null;
  avgTimeToCompleteMinutes: number | null;
  rejectionRatePct: number | null;
  topCategories: Array<{ category: Category; count: number }>;
  /** Unix milliseconds. */
  joinedAt: number;
  /** Unix milliseconds. */
  lastSeenAt: number | null;
}

const LIVE_TASK_STATUSES: TaskStatus[] = ["PENDING_DEPOSIT", "OPEN", "PAUSED", "FAIRNESS_FLAGGED"];

export async function getAiStats(userId: string): Promise<AiStats> {
  const [user, tasks, slotsAwarded, slotsRejected, paidAgg, liveEscrowAgg] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { createdAt: true, lastSeenAt: true },
      }),
      prisma.task.findMany({
        where: { posterId: userId },
        select: {
          privacy: true,
          status: true,
          category: true,
          createdAt: true,
          fundedAt: true,
        },
      }),
      prisma.slot.count({
        where: { task: { posterId: userId }, status: "PAID" },
      }),
      prisma.slot.count({
        where: { task: { posterId: userId }, status: "REJECTED" },
      }),
      prisma.slot.aggregate({
        where: { task: { posterId: userId }, status: "PAID" },
        _sum: { awardedUsdt: true },
      }),
      prisma.task.aggregate({
        where: { posterId: userId, status: { in: LIVE_TASK_STATUSES } },
        _sum: { totalUsdt: true },
      }),
    ]);

  // Task-status rollup.
  let pub = 0,
    priv = 0,
    live = 0,
    completed = 0,
    cancelled = 0,
    purged = 0;
  const fundDurations: number[] = [];
  const catCount = new Map<Category, number>();
  for (const t of tasks) {
    if (t.privacy === "PUBLIC") pub++;
    else priv++;
    if (LIVE_TASK_STATUSES.includes(t.status)) live++;
    else if (t.status === "COMPLETED") completed++;
    else if (t.status === "CANCELLED") cancelled++;
    else if (t.status === "PURGED") purged++;
    if (t.fundedAt) {
      const m = minutesBetween(t.fundedAt, t.createdAt);
      if (m >= 0) fundDurations.push(m);
    }
    catCount.set(t.category, (catCount.get(t.category) ?? 0) + 1);
  }

  // Average time-to-complete on this AI's paid slots.
  const paidSlotTimings = await prisma.slot.findMany({
    where: { task: { posterId: userId }, status: "PAID" },
    select: { claimedAt: true, decidedAt: true },
  });
  const completeDurations: number[] = [];
  for (const s of paidSlotTimings) {
    if (!s.claimedAt || !s.decidedAt) continue;
    const m = minutesBetween(s.decidedAt, s.claimedAt);
    if (m >= 0) completeDurations.push(m);
  }

  const decided = slotsAwarded + slotsRejected;
  const rejectionRatePct =
    decided === 0 ? null : Math.round((slotsRejected / decided) * 1000) / 10;

  const topCategories = [...catCount.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    tasksPosted: {
      total: tasks.length,
      public: pub,
      private: priv,
      live,
      completed,
      cancelled,
      purged,
    },
    slotsAwarded,
    slotsRejected,
    totalPaidOutUsdt: paidAgg._sum.awardedUsdt ? Number(paidAgg._sum.awardedUsdt) : 0,
    totalEscrowedUsdt: liveEscrowAgg._sum.totalUsdt ? Number(liveEscrowAgg._sum.totalUsdt) : 0,
    avgTimeToFundMinutes: mean(fundDurations),
    avgTimeToCompleteMinutes: mean(completeDurations),
    rejectionRatePct,
    topCategories,
    joinedAt: user.createdAt.getTime(),
    lastSeenAt: toUnix(user.lastSeenAt),
  };
}

export interface RecentActivityItem {
  taskId: string;
  taskTitle: string;
  type: TaskType;
  category: Category;
  status: string;
  awardedUsdt: number | null;
  /** Unix milliseconds. */
  claimedAt: number | null;
  /** Unix milliseconds. */
  decidedAt: number | null;
  durationMinutes: number | null;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}

/**
 * Recent activity restricted to PUBLIC tasks only.
 * - HUMAN: last 25 slots whose task is PUBLIC.
 * - AI: last 25 PUBLIC tasks posted.
 * Returning only PUBLIC means we never leak private task titles.
 */
export async function getRecentPublicActivity(
  userId: string,
  role: "HUMAN" | "AI",
): Promise<RecentActivityItem[]> {
  if (role === "HUMAN") {
    const slots = await prisma.slot.findMany({
      where: { humanId: userId, task: { privacy: "PUBLIC" } },
      orderBy: [{ claimedAt: "desc" }, { id: "desc" }],
      take: 25,
      select: {
        status: true,
        awardedUsdt: true,
        claimedAt: true,
        decidedAt: true,
        task: {
          select: {
            id: true,
            title: true,
            type: true,
            category: true,
            country: true,
            city: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });
    return slots.map((s) => ({
      taskId: s.task.id,
      taskTitle: s.task.title,
      type: s.task.type,
      category: s.task.category,
      status: s.status,
      awardedUsdt: s.awardedUsdt != null ? Number(s.awardedUsdt) : null,
      claimedAt: toUnix(s.claimedAt),
      decidedAt: toUnix(s.decidedAt),
      durationMinutes:
        s.claimedAt && s.decidedAt ? minutesBetween(s.decidedAt, s.claimedAt) : null,
      country: s.task.country,
      city: s.task.city,
      latitude: s.task.latitude,
      longitude: s.task.longitude,
    }));
  }

  // AI: their public tasks.
  const tasks = await prisma.task.findMany({
    where: { posterId: userId, privacy: "PUBLIC" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      title: true,
      type: true,
      category: true,
      status: true,
      totalUsdt: true,
      createdAt: true,
      fundedAt: true,
      country: true,
      city: true,
      latitude: true,
      longitude: true,
    },
  });
  return tasks.map((t) => ({
    taskId: t.id,
    taskTitle: t.title,
    type: t.type,
    category: t.category,
    status: t.status,
    awardedUsdt: Number(t.totalUsdt),
    claimedAt: toUnix(t.fundedAt),
    decidedAt: null,
    durationMinutes: null,
    country: t.country,
    city: t.city,
    latitude: t.latitude,
    longitude: t.longitude,
  }));
}

/**
 * Compact duration like "23m", "1h 14m", "2d 4h". Returns null-safe ".".
 */
export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return ".";
  const totalMin = Math.round(minutes);
  if (totalMin < 60) return `${totalMin}m`;
  const totalHr = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  if (totalHr < 24) {
    return remMin === 0 ? `${totalHr}h` : `${totalHr}h ${remMin}m`;
  }
  const days = Math.floor(totalHr / 24);
  const remHr = totalHr % 24;
  return remHr === 0 ? `${days}d` : `${days}d ${remHr}h`;
}

// `fmtRelativeTime` was removed: relative-time formatting is now performed in
// the `<RelativeTime ts={number} />` client component under
// `src/components/time/`. Server-side rendering of relative strings would
// otherwise either drift between request and render or cause a hydration
// mismatch.
