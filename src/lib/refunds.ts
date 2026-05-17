import { prisma } from "./db";
import { sendPayout } from "./solana/payout";
import { isValidPubkey } from "./solana/client";
import { Prisma } from "@prisma/client";

/**
 * Refund the AI for every slot of a task that was NOT delivered, then close
 * the task out. Used when a task passes its AI-set deadline.
 *
 * "Not delivered" = slot is OPEN (never awarded) or CLAIMED with nothing
 * submitted yet (for JOBs: no milestone in SUBMITTED/DISPUTED/PAID). Those
 * slots are forfeited, their full per-slot escrow (including the 5% fee - the
 * platform rendered no service) is refunded to the poster in USDT, and the
 * assigned human (if any) takes a rejection on their reputation.
 *
 * Slots that are SUBMITTED/DISPUTED (or JOB slots with milestone work in
 * flight) are left to finish their normal lifecycle. The task is only marked
 * CANCELLED once nothing is left pending.
 *
 * Idempotent: only ever acts on OPEN/CLAIMED slots, so re-running is safe. If
 * the on-chain refund fails it leaves state untouched to retry next sweep.
 */
export async function refundExpiredTask(taskId: string): Promise<{
  refundedUsdt: number;
  slotsForfeited: number;
  closed: boolean;
} | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      poster: true,
      slots: { include: { milestones: { select: { status: true } } } },
    },
  });
  if (!task) return null;
  if (task.status !== "OPEN" && task.status !== "PAUSED") return null;

  const inFlight = (s: (typeof task.slots)[number]) =>
    s.status === "SUBMITTED" ||
    s.status === "DISPUTED" ||
    s.milestones.some(
      (m) => m.status === "SUBMITTED" || m.status === "DISPUTED" || m.status === "PAID",
    );

  const refundable = task.slots.filter(
    (s) => (s.status === "OPEN" || s.status === "CLAIMED") && !inFlight(s),
  );

  const perSlotUsdt = Number(task.totalUsdt) / task.slotCount; // full per-slot escrow incl. fee
  const refundUsdt = Math.round(perSlotUsdt * refundable.length * 1e6) / 1e6;

  // A poster wallet that can't be parsed can never receive an on-chain
  // transfer. In practice this only happens for seed/mock posters (real
  // posters prove ownership of a valid pubkey at registration). Don't wedge
  // the sweep retrying forever: log once and close the task out with the
  // slots forfeited but no refund (there are no real escrowed funds).
  const payablePoster = isValidPubkey(task.poster.solanaPubkey);
  if (refundUsdt > 0 && !payablePoster) {
    console.warn(
      `[refundExpiredTask] poster ${task.poster.username} has an unparseable ` +
        `pubkey (${task.poster.solanaPubkey}); closing task ${task.id} without refund`,
    );
  }

  // If there is something to refund to a real wallet, do the transfer first.
  let sig: string | null = null;
  if (refundUsdt > 0 && payablePoster) {
    try {
      const res = await sendPayout({
        toAddr: task.poster.solanaPubkey,
        usdt: refundUsdt,
        memo: `${task.id}/refund`,
      });
      sig = res.signature;
    } catch (err) {
      console.error("[refundExpiredTask] refund payout failed; will retry", err);
      return null; // leave state untouched, retry next sweep
    }
  }

  const remainingInFlight = task.slots.some(inFlight);
  const anyPaid = task.slots.some((s) => s.status === "PAID");

  await prisma.$transaction(async (tx) => {
    for (const s of refundable) {
      await tx.slot.update({
        where: { id: s.id },
        data: { status: "REFUNDED", decidedAt: new Date() },
      });
      // A human who was awarded a slot but never delivered takes a rejection.
      if (s.status === "CLAIMED" && s.humanId) {
        await tx.humanProfile.update({
          where: { userId: s.humanId },
          data: { rejectedCount: { increment: 1 } },
        });
      }
    }
    if (sig) {
      await tx.tokenTxLog.create({
        data: {
          signature: sig,
          kind: "REFUND",
          fromAddr: process.env.SOLANA_ESCROW_PUBKEY!,
          toAddr: task.poster.solanaPubkey,
          amountUsdt: new Prisma.Decimal(refundUsdt.toFixed(6)) as unknown as Prisma.Decimal,
          memo: `${task.id}/refund`,
          taskId: task.id,
          userId: task.poster.id,
        },
      });
    }
    if (!remainingInFlight) {
      await tx.task.update({
        where: { id: task.id },
        data: { status: anyPaid ? "COMPLETED" : "CANCELLED" },
      });
    }
  });

  return {
    refundedUsdt: sig ? refundUsdt : 0,
    slotsForfeited: refundable.length,
    closed: !remainingInFlight,
  };
}
