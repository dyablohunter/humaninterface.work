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
 * Atomically award an OPEN slot to a human at `amountUsdt`. Creates/updates
 * the Bid as ACCEPTED. Returns the slotId, or null if no OPEN slot is left.
 * Must run inside a prisma.$transaction.
 */
export async function awardSlot(
  tx: Prisma.TransactionClient,
  args: { taskId: string; humanId: string; amountUsdt: number; message?: string | null },
): Promise<string | null> {
  const open = await tx.slot.findFirst({
    where: { taskId: args.taskId, status: "OPEN", humanId: null },
    orderBy: { id: "asc" },
  });
  if (!open) return null;

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

  return slot.id;
}
