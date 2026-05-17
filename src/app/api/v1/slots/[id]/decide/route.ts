import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAI } from "@/lib/auth/middleware";
import { enforceAiContentPolicy } from "@/lib/moderation";
import { decisionSchema } from "@/lib/validation-tasks";
import { awardSplitUsdt } from "@/lib/pricing";
import { paidCounterField } from "@/lib/reputation";
import { payoutOnce } from "@/lib/payout-idempotent";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rawBody = await req.text();
  const auth = await authenticateAI(req, rawBody);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { approve, note } = parsed.data;

  if (note && note.trim()) {
    const screened = await enforceAiContentPolicy(auth.userId, note, {
      kind: "DECISION_NOTE",
      targetId: id,
    });
    if (screened) return screened;
  }

  const slot = await prisma.slot.findUnique({
    where: { id },
    include: { task: { include: { poster: true } }, human: true },
  });
  if (!slot) return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  if (slot.task.posterId !== auth.userId) {
    return NextResponse.json({ error: "not_task_owner" }, { status: 403 });
  }
  if (slot.status !== "SUBMITTED") {
    return NextResponse.json({ error: "slot_not_submitted", status: slot.status }, { status: 409 });
  }
  if (slot.task.type === "JOB") {
    return NextResponse.json({ error: "use_milestone_decide_for_jobs" }, { status: 400 });
  }

  if (!approve) {
    await prisma.$transaction([
      prisma.slot.update({
        where: { id: slot.id },
        data: { status: "REJECTED", decidedAt: new Date(), rejectionReason: note ?? null },
      }),
      ...(slot.humanId
        ? [
            prisma.humanProfile.update({
              where: { userId: slot.humanId },
              data: { rejectedCount: { increment: 1 } },
            }),
          ]
        : []),
    ]);
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  if (!slot.human) {
    return NextResponse.json({ error: "slot_has_no_human" }, { status: 500 });
  }
  const statedPriceUsdt = Number(slot.task.statedPriceUsdt);
  const awardedUsdt = slot.awardedUsdt === null ? statedPriceUsdt : Number(slot.awardedUsdt);
  const { payoutUsdt, refundUsdt } = awardSplitUsdt({
    statedPriceUsdt,
    awardedUsdt,
  });

  // Atomically claim the slot before sending USDT.
  const claim = await prisma.slot.updateMany({
    where: { id: slot.id, status: "SUBMITTED" },
    data: { status: "PAYING" },
  });
  if (claim.count !== 1) {
    return NextResponse.json(
      { error: "already_in_progress_or_complete" },
      { status: 409 },
    );
  }

  let payoutSig: string;
  try {
    const res = await payoutOnce({
      memoKey: `payout:slot:${slot.id}`,
      toAddr: slot.human.solanaPubkey,
      usdt: payoutUsdt,
      kind: "PAYOUT",
      taskId: slot.task.id,
      slotId: slot.id,
      userId: slot.human.id,
    });
    payoutSig = res.signature;
  } catch (err) {
    console.error("[decide] payout failed", err);
    return NextResponse.json({ error: "payout_failed" }, { status: 502 });
  }

  let refundSig: string | null = null;
  if (refundUsdt > 0) {
    try {
      const res = await payoutOnce({
        memoKey: `refund:slot:${slot.id}`,
        toAddr: slot.task.poster.solanaPubkey,
        usdt: refundUsdt,
        kind: "REFUND",
        taskId: slot.task.id,
        slotId: slot.id,
        userId: slot.task.posterId,
      });
      refundSig = res.signature;
    } catch (err) {
      // Payout succeeded; delta refund can be reconciled by admin.
      console.error("[decide] AI refund failed (payout succeeded)", err);
    }
  }

  const tierField = paidCounterField(slot.task.type as "MICRO" | "TASK");

  await prisma.$transaction([
    prisma.slot.update({
      where: { id: slot.id },
      data: { status: "PAID", decidedAt: new Date(), paidTxSig: payoutSig },
    }),
    prisma.humanProfile.update({
      where: { userId: slot.human.id },
      data: { completed: { increment: 1 }, [tierField]: { increment: 1 } },
    }),
  ]);

  await maybeCompleteTask(slot.task.id);

  return NextResponse.json({
    ok: true,
    status: "PAID",
    txSignature: payoutSig,
    paidUsdt: payoutUsdt,
    refundedUsdt: refundUsdt,
    refundTxSignature: refundSig,
  });
}

async function maybeCompleteTask(taskId: string) {
  const slots = await prisma.slot.findMany({ where: { taskId } });
  const allDone = slots.every(
    (s) => s.status === "PAID" || s.status === "REFUNDED" || s.status === "REJECTED",
  );
  if (allDone) {
    await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });
  }
}
