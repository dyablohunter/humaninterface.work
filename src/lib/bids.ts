import { prisma } from "./db";
import { computeReputation, meetsReputation } from "./reputation";
import type { Prisma, Task } from "@prisma/client";

/**
 * Eligibility for bidding/claiming. Gates on:
 *  - task open & (if private) invited
 *  - deadline not passed
 *  - self-declared category match
 *  - reputation ≥ task.minReputation
 * Returns null if eligible, or an { error, status } to return to the caller.
 */
export async function checkBidEligibility(taskId: string, humanId: string): Promise<
  | { ok: true; task: Task }
  | { ok: false; error: string; status: number }
> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "task_not_found", status: 404 };
  if (task.status !== "OPEN") {
    return { ok: false, error: "task_not_open", status: 409 };
  }
  if (task.privacy === "PRIVATE" && task.invitedHumanId !== humanId) {
    return { ok: false, error: "private_task_not_invited", status: 403 };
  }
  if (task.deadlineAt && task.deadlineAt.getTime() <= Date.now()) {
    return { ok: false, error: "task_deadline_passed", status: 409 };
  }

  const profile = await prisma.humanProfile.findUnique({ where: { userId: humanId } });
  if (!profile || !profile.categories.includes(task.category)) {
    return { ok: false, error: "category_not_in_profile", status: 403 };
  }

  const rep = computeReputation(profile);
  if (!meetsReputation(rep, task.minReputation)) {
    return { ok: false, error: "reputation_below_minimum", status: 403 };
  }

  return { ok: true, task };
}

/**
 * Outcome of `awardSlot`. Distinguishes "no open slot" (caller falls back to
 * a pending bid) from "bidding window closed mid-transaction" (caller must
 * reject the request entirely).
 */
export type AwardResult =
  | { ok: true; slotId: string }
  | { ok: false; reason: "no_open_slot" | "bidding_closed" | "amount_not_monotonic" };

/**
 * Atomically award an OPEN slot to a human at `amountUsdt`. Creates/updates
 * the Bid as ACCEPTED. Must run inside a prisma.$transaction.
 *
 * Race / fairness guarantees enforced inside the transaction:
 *  - `task.biddingClosesAt` is re-fetched and re-validated *inside* the tx so
 *    a bid that beat the worker's auto-accept by milliseconds outside the tx
 *    can't slip in once the window closed.
 *  - If a PENDING bid already exists from this human, the new `amountUsdt`
 *    must be ≤ the existing pending amount. Reverse auctions are
 *    monotonically decreasing; allowing a bidder to raise their offer
 *    between submission and acceptance lets them bait-and-switch the AI.
 */
export async function awardSlot(
  tx: Prisma.TransactionClient,
  args: { taskId: string; humanId: string; amountUsdt: number; message?: string | null },
): Promise<AwardResult> {
  const task = await tx.task.findUnique({
    where: { id: args.taskId },
    select: { biddingClosesAt: true, status: true },
  });
  if (!task || task.status !== "OPEN") return { ok: false, reason: "no_open_slot" };
  if (task.biddingClosesAt && task.biddingClosesAt.getTime() <= Date.now()) {
    return { ok: false, reason: "bidding_closed" };
  }

  const existingBid = await tx.bid.findUnique({
    where: { taskId_humanId: { taskId: args.taskId, humanId: args.humanId } },
    select: { amountUsdt: true, status: true },
  });
  if (
    existingBid &&
    existingBid.status === "PENDING" &&
    Number(existingBid.amountUsdt) < args.amountUsdt
  ) {
    return { ok: false, reason: "amount_not_monotonic" };
  }

  const open = await tx.slot.findFirst({
    where: { taskId: args.taskId, status: "OPEN", humanId: null },
    orderBy: { id: "asc" },
  });
  if (!open) return { ok: false, reason: "no_open_slot" };

  const slot = await tx.slot.update({
    where: { id: open.id, status: "OPEN" },
    data: {
      humanId: args.humanId,
      status: "CLAIMED",
      claimedAt: new Date(),
      awardedUsdt: args.amountUsdt,
    },
  });

  await tx.bid.upsert({
    where: { taskId_humanId: { taskId: args.taskId, humanId: args.humanId } },
    create: {
      taskId: args.taskId,
      humanId: args.humanId,
      amountUsdt: args.amountUsdt,
      message: args.message ?? null,
      status: "ACCEPTED",
      slotId: slot.id,
      decidedAt: new Date(),
    },
    update: {
      status: "ACCEPTED",
      amountUsdt: args.amountUsdt,
      slotId: slot.id,
      decidedAt: new Date(),
    },
  });

  return { ok: true, slotId: slot.id };
}
