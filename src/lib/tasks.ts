import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

/** Statuses that are still live on the public marketplace. */
export const LIVE_STATUSES = ["OPEN", "PAUSED", "FAIRNESS_FLAGGED"] as const;

/** Terminal statuses - the task is finished and archived. */
export const ARCHIVED_STATUSES = ["COMPLETED", "CANCELLED", "PURGED"] as const;

/**
 * A task is archived (admin-only, hidden from public browse) once it has
 * expired, been finalized, or been cancelled/purged. Tasks whose AI-set
 * deadline has passed are treated as archived even before the purge sweep
 * flips their status.
 */
export function isTaskArchived(
  t: { status: string; deadlineAt: Date | null },
  now: Date = new Date(),
): boolean {
  if ((ARCHIVED_STATUSES as readonly string[]).includes(t.status)) return true;
  if (t.deadlineAt && t.deadlineAt.getTime() <= now.getTime()) return true;
  return false;
}

/**
 * Prisma `where` fragment selecting only public, non-archived, non-expired
 * tasks - the set visible on every public browse surface (feed, homepage,
 * profiles, sitemap).
 */
export function publicLiveTaskWhere(now: Date = new Date()): Prisma.TaskWhereInput {
  return {
    privacy: "PUBLIC",
    status: { in: [...LIVE_STATUSES] },
    OR: [{ deadlineAt: null }, { deadlineAt: { gt: now } }],
    // A banned AI's posts are kept (admin/poster can still see them) but pulled
    // from every public surface so no human bids on work it can never approve.
    poster: { is: { banned: false } },
  };
}

/**
 * Returns the USDT amount payable per slot (excluding service fee, which is
 * already in escrow and stays with the platform on payout).
 */
export function perSlotUsdt(totalUsdtWithFee: number, slotCount: number): number {
  const totalBase = totalUsdtWithFee / 1.05; // strip 5% fee
  return totalBase / slotCount;
}

/**
 * Returns the USDT amount payable per milestone for a job. Splits the per-slot
 * amount evenly across all milestones (one per day, where day = hoursForDay).
 */
export function perMilestoneUsdt(
  totalUsdtWithFee: number,
  slotCount: number,
  totalMilestonesPerSlot: number,
): number {
  return perSlotUsdt(totalUsdtWithFee, slotCount) / totalMilestonesPerSlot;
}

export async function findOpenSlot(taskId: string) {
  return prisma.slot.findFirst({
    where: { taskId, status: "OPEN", humanId: null },
    orderBy: { id: "asc" },
  });
}
