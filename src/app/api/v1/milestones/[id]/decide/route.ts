import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAI } from "@/lib/auth/middleware";
import { enforceAiContentPolicy } from "@/lib/moderation";
import { decisionSchema } from "@/lib/validation-tasks";
import { awardSplitUsdt } from "@/lib/pricing";
import { sendPayout } from "@/lib/solana/payout";
import { Prisma } from "@prisma/client";

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

  // The AI-authored decision note is screened for illegal/inhumane content,
  // same as a task post - a violation bans the AI and purges its data.
  if (note && note.trim()) {
    const screened = await enforceAiContentPolicy(auth.userId, note, {
      kind: "DECISION_NOTE",
      targetId: id,
    });
    if (screened) return screened;
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { slot: { include: { task: { include: { poster: true } }, human: true } } },
  });
  if (!milestone) return NextResponse.json({ error: "milestone_not_found" }, { status: 404 });
  if (milestone.slot.task.posterId !== auth.userId) {
    return NextResponse.json({ error: "not_task_owner" }, { status: 403 });
  }
  if (milestone.status !== "SUBMITTED") {
    return NextResponse.json({ error: "milestone_not_submitted", status: milestone.status }, { status: 409 });
  }

  if (!approve) {
    await prisma.$transaction([
      prisma.milestone.update({
        where: { id: milestone.id },
        data: { status: "REJECTED", approvedAt: null, rejectionReason: note ?? null },
      }),
      ...(milestone.slot.humanId
        ? [
            prisma.humanProfile.update({
              where: { userId: milestone.slot.humanId },
              data: { rejectedCount: { increment: 1 } },
            }),
          ]
        : []),
    ]);
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  if (!milestone.slot.human) {
    return NextResponse.json({ error: "slot_has_no_human" }, { status: 500 });
  }

  // The winning bid (awardedUsdt) is the human's total pay for the whole job
  // slot. Each milestone pays a fraction proportional to its hoursForDay
  // against the job's total estimated hours, in USDT.
  const task = milestone.slot.task;
  const totalHours = task.estimatedMinutes / 60;
  const statedPriceUsdt = Number(task.statedPriceUsdt);
  const awardedUsdt =
    milestone.slot.awardedUsdt === null ? statedPriceUsdt : Number(milestone.slot.awardedUsdt);
  const milestoneUsdt = awardedUsdt * (milestone.hoursForDay / totalHours);
  const payoutUsdt = Math.round(milestoneUsdt * 1e6) / 1e6;

  let sig: string;
  try {
    const res = await sendPayout({
      toAddr: milestone.slot.human.solanaPubkey,
      usdt: payoutUsdt,
      memo: `${task.id}/m${milestone.sequenceNum}`,
    });
    sig = res.signature;
  } catch (err) {
    console.error("[milestone-decide] payout failed", err);
    return NextResponse.json({ error: "payout_failed" }, { status: 502 });
  }

  await prisma.$transaction([
    prisma.milestone.update({
      where: { id: milestone.id },
      data: { status: "PAID", approvedAt: new Date(), paidTxSig: sig },
    }),
    prisma.tokenTxLog.create({
      data: {
        signature: sig,
        kind: "PAYOUT",
        fromAddr: process.env.SOLANA_ESCROW_PUBKEY!,
        toAddr: milestone.slot.human.solanaPubkey,
        amountUsdt: new Prisma.Decimal(payoutUsdt.toFixed(6)) as unknown as Prisma.Decimal,
        memo: `${task.id}/m${milestone.sequenceNum}`,
        taskId: task.id,
        slotId: milestone.slotId,
        milestoneId: milestone.id,
        userId: milestone.slot.human.id,
      },
    }),
  ]);

  // Slot fully delivered? Mark PAID, credit reputation, refund the AI the
  // unspent escrow (stated − awarded, plus fee saved on the difference).
  const updated = await prisma.milestone.findMany({ where: { slotId: milestone.slotId } });
  const paidHours = updated.filter((m) => m.status === "PAID").reduce((s, m) => s + m.hoursForDay, 0);
  let refundSig: string | null = null;
  let refundUsdtFinal = 0;
  if (paidHours >= totalHours - 0.001) {
    const { refundUsdt } = awardSplitUsdt({ statedPriceUsdt, awardedUsdt });
    refundUsdtFinal = refundUsdt;
    if (refundUsdt > 0) {
      try {
        const res = await sendPayout({
          toAddr: task.poster.solanaPubkey,
          usdt: refundUsdt,
          memo: `${task.id}/refund`,
        });
        refundSig = res.signature;
      } catch (err) {
        console.error("[milestone-decide] AI refund failed (payout succeeded)", err);
      }
    }
    await prisma.$transaction([
      prisma.slot.update({ where: { id: milestone.slotId }, data: { status: "PAID" } }),
      prisma.humanProfile.update({
        where: { userId: milestone.slot.human.id },
        data: { completed: { increment: 1 }, jobPaid: { increment: 1 } },
      }),
      ...(refundSig
        ? [
            prisma.tokenTxLog.create({
              data: {
                signature: refundSig,
                kind: "REFUND",
                fromAddr: process.env.SOLANA_ESCROW_PUBKEY!,
                toAddr: task.poster.solanaPubkey,
                amountUsdt: new Prisma.Decimal(refundUsdtFinal.toFixed(6)) as unknown as Prisma.Decimal,
                memo: `${task.id}/refund`,
                taskId: task.id,
                slotId: milestone.slotId,
                userId: task.posterId,
              },
            }),
          ]
        : []),
    ]);
  }

  return NextResponse.json({
    ok: true,
    status: "PAID",
    txSignature: sig,
    payoutUsdt,
    hoursPaid: milestone.hoursForDay,
    slotComplete: paidHours >= totalHours - 0.001,
    refundTxSignature: refundSig,
  });
}
