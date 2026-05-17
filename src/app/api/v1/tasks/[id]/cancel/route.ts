import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAI } from "@/lib/auth/middleware";
import { payoutOnce } from "@/lib/payout-idempotent";

/**
 * AI cancellation rules:
 *  - PENDING_DEPOSIT: cancel for free (nothing on-chain yet). Status → CANCELLED.
 *  - OPEN with zero claimed slots: full USDT refund minus 5% service fee.
 *  - OPEN/PAUSED/FAIRNESS_FLAGGED with some claimed slots: refund only the
 *    unclaimed slots' base amount (no fee refunded). Claimed/in-flight slots
 *    continue their lifecycle.
 *  - COMPLETED / CANCELLED / PURGED: no-op (409).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rawBody = await req.text();
  const auth = await authenticateAI(req, rawBody);
  if (auth instanceof NextResponse) return auth;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { slots: true, poster: true },
  });
  if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  if (task.posterId !== auth.userId) {
    return NextResponse.json({ error: "not_task_owner" }, { status: 403 });
  }
  const terminal = ["COMPLETED", "CANCELLED", "PURGED", "CANCELLING"] as const;
  if ((terminal as readonly string[]).includes(task.status)) {
    return NextResponse.json({ error: "task_already_terminal", status: task.status }, { status: 409 });
  }

  if (task.status === "PENDING_DEPOSIT") {
    // Atomic guard so two PENDING_DEPOSIT cancels can't race.
    const claim = await prisma.task.updateMany({
      where: { id: task.id, status: "PENDING_DEPOSIT" },
      data: { status: "CANCELLED" },
    });
    if (claim.count !== 1) {
      return NextResponse.json(
        { error: "already_in_progress_or_complete" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, status: "CANCELLED", refundedUsdt: 0 });
  }

  const claimedSlots = task.slots.filter(
    (s) => s.status !== "OPEN" && s.status !== "REFUNDED",
  );
  const openSlots = task.slots.filter((s) => s.status === "OPEN");
  const totalUsdtWithFee = Number(task.totalUsdt);

  let refundUsdt: number;
  if (claimedSlots.length === 0) {
    refundUsdt = totalUsdtWithFee / 1.05;
  } else if (openSlots.length === 0) {
    return NextResponse.json({ error: "no_unclaimed_slots_to_cancel" }, { status: 409 });
  } else {
    const totalBaseUsdt = totalUsdtWithFee / 1.05;
    const perSlotBaseUsdt = totalBaseUsdt / task.slotCount;
    refundUsdt = perSlotBaseUsdt * openSlots.length;
  }
  refundUsdt = Math.round(refundUsdt * 1e6) / 1e6;

  // Atomically claim. Allow any of OPEN/PAUSED/FAIRNESS_FLAGGED → CANCELLING.
  const claim = await prisma.task.updateMany({
    where: {
      id: task.id,
      status: { in: ["OPEN", "PAUSED", "FAIRNESS_FLAGGED"] },
    },
    data: { status: "CANCELLING" },
  });
  if (claim.count !== 1) {
    return NextResponse.json(
      { error: "already_in_progress_or_complete" },
      { status: 409 },
    );
  }

  let sig: string;
  try {
    const res = await payoutOnce({
      memoKey: `refund:task:${task.id}`,
      toAddr: task.poster.solanaPubkey,
      usdt: refundUsdt,
      kind: "REFUND",
      taskId: task.id,
      userId: task.poster.id,
    });
    sig = res.signature;
  } catch (err) {
    console.error("[cancel] refund payout failed", err);
    return NextResponse.json({ error: "refund_failed" }, { status: 502 });
  }

  await prisma.$transaction(async (tx) => {
    if (claimedSlots.length === 0) {
      await tx.task.update({
        where: { id: task.id },
        data: { status: "CANCELLED" },
      });
      await tx.slot.updateMany({
        where: { taskId: task.id, status: "OPEN" },
        data: { status: "REFUNDED" },
      });
    } else {
      // Keep task OPEN/PAUSED so claimed slots can finish; close out unclaimed.
      // Revert the CANCELLING claim back to OPEN to allow ongoing slots.
      await tx.task.update({
        where: { id: task.id },
        data: { status: "OPEN" },
      });
      await tx.slot.updateMany({
        where: { taskId: task.id, status: "OPEN" },
        data: { status: "REFUNDED" },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    refundedUsdt: refundUsdt,
    txSignature: sig,
    slotsRefunded: openSlots.length,
    slotsContinuing: claimedSlots.length,
  });
}
