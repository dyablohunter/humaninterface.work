/**
 * Auto-accept bids worker.
 *
 * When a task's reverse-auction bidding window (`biddingClosesAt`) elapses,
 * we deterministically award the lowest qualifying PENDING bid to each still
 * OPEN slot. Then, in a separate phase, every slot that did NOT receive an
 * award is REFUNDED to the AI poster (per-slot share of escrow + fee). If
 * the auction had zero awards at all, the task is hard-deleted (the cascade
 * sweeps every dependent row).
 *
 * "Qualifying" mirrors the eligibility rules of the normal /bid endpoint:
 *   - bidder's profile.categories must include task.category, AND
 *   - bidder's reputation must meetsReputation(rep, task.minReputation).
 *
 * Tiebreak: amountUsdt ASC, then createdAt ASC (stable, deterministic).
 *
 * A bidder can only win one slot per task - if their bid is awarded a slot,
 * they're skipped for the remaining slots of the same task in this run.
 *
 * Phases (per task):
 *   1. AWARD (single tx, Serializable). Award qualifying bids to OPEN slots.
 *   2. REFUND (one tx per slot, around an external on-chain call). For each
 *      slot still OPEN, send `1.05 × statedPriceUsdt` USDT back to the poster
 *      via the idempotent `payoutOnce` helper, then finalize the slot to
 *      REFUNDED in a small tx. On-chain calls MUST NOT be wrapped in a Prisma
 *      transaction (they're external).
 *   3. FINALIZE (single tx). If every slot refund succeeded AND zero slots
 *      were awarded, hard-delete the task (cascade handles dependents).
 *      Otherwise, REJECT remaining PENDING bids (bidding is closed) and leave
 *      the task in OPEN for the poster to extend / cancel.
 *
 * Each phase's failure is logged but doesn't block other tasks; the worker
 * tick will retry on the next pass. Per-slot refunds use a deterministic
 * `memoKey` (`refund:slot:<id>:bidding_expired`) so retries collide on the
 * TokenTxLog unique constraint and we never double-refund.
 */

import { prisma } from "@/lib/db";
import { computeReputation, meetsReputation } from "@/lib/reputation";
import { payoutOnce } from "@/lib/payout-idempotent";
import type { Prisma } from "@prisma/client";

interface TaskResult {
  taskId: string;
  awarded: number;
  unfilled: number;
  refunded: number;
  refundFailed: number;
  rejected: number;
  deleted: boolean;
}

export async function runAutoAcceptBids(): Promise<TaskResult[]> {
  const now = new Date();
  const due = await prisma.task.findMany({
    where: {
      status: "OPEN",
      biddingClosesAt: { not: null, lte: now },
    },
    select: { id: true },
  });

  const results: TaskResult[] = [];
  for (const t of due) {
    try {
      const res = await processTask(t.id);
      results.push(res);

      await prisma.auditLog.create({
        data: {
          action: "auto_accept_bids",
          payload: {
            taskId: res.taskId,
            awarded: res.awarded,
            unfilled: res.unfilled,
            refunded: res.refunded,
            refundFailed: res.refundFailed,
            rejected: res.rejected,
            deleted: res.deleted,
          },
        },
      });
    } catch (err) {
      console.error("[auto-accept-bids] task", t.id, "failed:", err);
    }
  }
  return results;
}

interface AwardOutcome {
  awarded: number;
  unfilledSlotIds: string[];
  posterPubkey: string;
  posterId: string;
  statedPriceUsdt: number;
  slotCount: number;
  totalUsdt: number;
}

async function processTask(taskId: string): Promise<TaskResult> {
  // Phase 1: load task + award qualifying bids inside a Serializable tx.
  const award = await awardPhase(taskId);
  if (!award) {
    // Task vanished between selection and processing - nothing to do.
    return {
      taskId,
      awarded: 0,
      unfilled: 0,
      refunded: 0,
      refundFailed: 0,
      rejected: 0,
      deleted: false,
    };
  }

  // Phase 2: refund every still-OPEN slot. Each refund is its own
  // outside-tx + finalize-tx pair, because `payoutOnce` makes an on-chain
  // call which must not be wrapped in a Prisma transaction.
  const refundUsdt = round6(award.statedPriceUsdt * 1.05);
  const refundSignatures: string[] = [];
  let refunded = 0;
  let refundFailed = 0;

  for (const slotId of award.unfilledSlotIds) {
    try {
      const r = await payoutOnce({
        memoKey: `refund:slot:${slotId}:bidding_expired`,
        toAddr: award.posterPubkey,
        usdt: refundUsdt,
        kind: "REFUND",
        taskId,
        slotId,
        userId: award.posterId,
      });
      // Finalize the slot in a tiny tx.
      await prisma.$transaction(async (tx) => {
        await tx.slot.updateMany({
          where: { id: slotId, status: "OPEN" },
          data: { status: "REFUNDED", paidTxSig: r.signature },
        });
        await tx.auditLog.create({
          data: {
            action: "auto_refund_slot_bidding_expired",
            userId: award.posterId,
            payload: {
              taskId,
              slotId,
              refundUsdt,
              signature: r.signature,
            },
          },
        });
      });
      refundSignatures.push(r.signature);
      refunded++;
    } catch (err) {
      refundFailed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error("[auto-accept-bids] refund failed slot", slotId, message);
      await prisma.auditLog.create({
        data: {
          action: "auto_refund_slot_failed",
          userId: award.posterId,
          payload: {
            taskId,
            slotId,
            refundUsdt,
            error: message,
          },
        },
      });
      // Leave slot in OPEN; next worker tick will retry with the same
      // deterministic memoKey, so payoutOnce remains safe.
    }
  }

  // Phase 3: finalize.
  let rejected = 0;
  let deleted = false;

  if (award.awarded === 0 && refundFailed === 0) {
    // Zero qualifying bids landed AND every refund succeeded → delete the
    // task entirely. Cascade sweeps slots / bids / milestones / evidence /
    // disputes / messages / reports / applications.
    await prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: taskId } });
      await tx.auditLog.create({
        data: {
          action: "task_deleted_no_bids",
          userId: award.posterId,
          payload: {
            taskId,
            posterId: award.posterId,
            statedPriceUsdt: award.statedPriceUsdt,
            slotCount: award.slotCount,
            totalUsdt: award.totalUsdt,
            refundSignatures,
          },
        },
      });
    });
    deleted = true;
  } else {
    // Partial fill (or some refund still pending retry). Reject remaining
    // PENDING bids on the task - the bidding window is closed.
    const now = new Date();
    const rejectRes = await prisma.bid.updateMany({
      where: { taskId, status: "PENDING" },
      data: { status: "REJECTED", decidedAt: now },
    });
    rejected = rejectRes.count;
  }

  return {
    taskId,
    awarded: award.awarded,
    unfilled: award.unfilledSlotIds.length,
    refunded,
    refundFailed,
    rejected,
    deleted,
  };
}

async function awardPhase(taskId: string): Promise<AwardOutcome | null> {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        category: true,
        minReputation: true,
        posterId: true,
        statedPriceUsdt: true,
        slotCount: true,
        totalUsdt: true,
        status: true,
        poster: { select: { solanaPubkey: true } },
      },
    });
    if (!task || task.status !== "OPEN") return null;

    const openSlots = await tx.slot.findMany({
      where: { taskId, status: "OPEN", humanId: null },
      orderBy: { id: "asc" },
    });

    const pendingBids = await tx.bid.findMany({
      where: { taskId, status: "PENDING" },
      orderBy: [{ amountUsdt: "asc" }, { createdAt: "asc" }],
      include: {
        human: {
          select: {
            humanProfile: {
              select: {
                categories: true,
                microPaid: true,
                taskPaid: true,
                jobPaid: true,
                rejectedCount: true,
              },
            },
          },
        },
      },
    });

    const awardedBidIds = new Set<string>();
    const winners = new Set<string>(); // humanIds already on a slot this task

    const existing = await tx.slot.findMany({
      where: { taskId, humanId: { not: null } },
      select: { humanId: true },
    });
    for (const s of existing) if (s.humanId) winners.add(s.humanId);

    const now = new Date();
    let awarded = 0;
    const awardedSlotIds = new Set<string>();

    for (const slot of openSlots) {
      for (const bid of pendingBids) {
        if (awardedBidIds.has(bid.id)) continue;
        if (winners.has(bid.humanId)) continue;

        const profile = bid.human.humanProfile;
        if (!profile) continue;
        if (!profile.categories.includes(task.category as never)) continue;

        const rep = computeReputation(profile);
        if (!meetsReputation(rep, task.minReputation)) continue;

        await tx.slot.update({
          where: { id: slot.id },
          data: {
            humanId: bid.humanId,
            status: "CLAIMED",
            awardedUsdt: bid.amountUsdt,
            claimedAt: now,
          },
        });
        await tx.bid.update({
          where: { id: bid.id },
          data: {
            status: "ACCEPTED",
            slotId: slot.id,
            decidedAt: now,
          },
        });
        awardedBidIds.add(bid.id);
        winners.add(bid.humanId);
        awardedSlotIds.add(slot.id);
        awarded++;
        break;
      }
    }

    // Slot IDs still OPEN after the awarding pass = the ones to refund.
    const unfilledSlotIds = openSlots
      .filter((s) => !awardedSlotIds.has(s.id))
      .map((s) => s.id);

    return {
      awarded,
      unfilledSlotIds,
      posterPubkey: task.poster.solanaPubkey,
      posterId: task.posterId,
      statedPriceUsdt: Number(task.statedPriceUsdt),
      slotCount: task.slotCount,
      totalUsdt: Number(task.totalUsdt),
    };
  }, { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel });
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
