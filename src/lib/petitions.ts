import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Petition voting electorate.
 *
 * A vote only counts toward the qualification threshold if it comes from an
 * "active contributor": a HUMAN who has completed (been paid for) at least one
 * task and has been seen on the platform within the last 30 days, and who is
 * not suspended, banned, or the admin.
 *
 * A petition is submitted to the admin for review once supporters reach at
 * least 51% of that current electorate.
 */

export const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const QUALIFY_RATIO = 0.51;

export function eligibleVoterWhere(now = new Date()): Prisma.UserWhereInput {
  return {
    role: "HUMAN",
    isAdmin: false,
    suspended: false,
    banned: false,
    lastSeenAt: { gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) },
    humanProfile: { completed: { gte: 1 } },
  };
}

/** Is this user currently part of the petition electorate? */
export async function isEligibleVoter(userId: string): Promise<boolean> {
  const u = await prisma.user.findFirst({
    where: { id: userId, ...eligibleVoterWhere() },
    select: { id: true },
  });
  return Boolean(u);
}

export interface PetitionProgress {
  electorate: number; // current eligible-voter population
  supporters: number; // eligible voters backing this petition
  needed: number; // votes required to qualify (≥51% of electorate)
  qualifies: boolean;
}

/** Eligible-voter support vs. the current electorate for one petition. */
export async function petitionProgress(petitionId: string): Promise<PetitionProgress> {
  const where = eligibleVoterWhere();
  const [electorate, supporters] = await Promise.all([
    prisma.user.count({ where }),
    prisma.petitionVote.count({ where: { petitionId, user: where } }),
  ]);
  const needed = electorate > 0 ? Math.ceil(QUALIFY_RATIO * electorate) : Infinity;
  return {
    electorate,
    supporters,
    needed: Number.isFinite(needed) ? needed : 0,
    qualifies: electorate > 0 && supporters >= needed,
  };
}

/**
 * Eligible-supporter counts for many petitions at once (one electorate count +
 * one grouped vote query), for list pages. Returns a map petitionId → count.
 */
export async function eligibleSupporterCounts(
  petitionIds: string[],
): Promise<{ electorate: number; supporters: Map<string, number> }> {
  const where = eligibleVoterWhere();
  const [electorate, grouped] = await Promise.all([
    prisma.user.count({ where }),
    prisma.petitionVote.groupBy({
      by: ["petitionId"],
      where: { petitionId: { in: petitionIds }, user: where },
      _count: { _all: true },
    }),
  ]);
  const supporters = new Map<string, number>();
  for (const g of grouped) supporters.set(g.petitionId, g._count._all);
  return { electorate, supporters };
}

export function votesNeeded(electorate: number): number {
  return electorate > 0 ? Math.ceil(QUALIFY_RATIO * electorate) : 0;
}

/**
 * Re-evaluates an OPEN petition and, if it now has ≥51% eligible support,
 * transitions it to QUALIFIED (submitted to the admin). Idempotent.
 */
export async function maybeQualify(petitionId: string): Promise<PetitionProgress & { status: string }> {
  const petition = await prisma.petition.findUnique({
    where: { id: petitionId },
    select: { status: true },
  });
  if (!petition) {
    return { electorate: 0, supporters: 0, needed: 0, qualifies: false, status: "OPEN" };
  }

  const progress = await petitionProgress(petitionId);

  if (petition.status === "OPEN" && progress.qualifies) {
    await prisma.petition.update({
      where: { id: petitionId },
      data: { status: "QUALIFIED", qualifiedAt: new Date() },
    });
    return { ...progress, status: "QUALIFIED" };
  }
  return { ...progress, status: petition.status };
}
