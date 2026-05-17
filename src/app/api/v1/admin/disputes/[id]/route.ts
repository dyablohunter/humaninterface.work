import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { payoutOnce } from "@/lib/payout-idempotent";
import { z } from "zod";

const resolveSchema = z.object({
  resolveFor: z.enum(["HUMAN", "AI"]),
  resolution: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      slot: { include: { task: true, human: true } },
      milestone: { include: { slot: { include: { task: true, human: true } } } },
    },
  });
  if (!dispute) return NextResponse.json({ error: "dispute_not_found" }, { status: 404 });
  if (dispute.status !== "OPEN") {
    return NextResponse.json({ error: "dispute_already_resolved" }, { status: 409 });
  }

  const resolvingForHuman = parsed.data.resolveFor === "HUMAN";

  if (resolvingForHuman) {
    const slot = dispute.slot ?? dispute.milestone?.slot;
    const task = slot?.task;
    const human = slot?.human;
    if (!task || !human || !slot) {
      return NextResponse.json({ error: "dispute_orphaned" }, { status: 500 });
    }

    // Compute payout in USDT.
    let payoutUsdt: number;
    let memoKey: string;
    if (dispute.slotId) {
      payoutUsdt = Number(task.totalUsdt) / 1.05 / task.slotCount;
      memoKey = `payout:dispute:${dispute.id}`;
    } else if (dispute.milestone) {
      const totalSlotUsdt = Number(task.totalUsdt) / 1.05 / task.slotCount;
      const totalHours = task.estimatedMinutes / 60;
      payoutUsdt = totalSlotUsdt * (dispute.milestone.hoursForDay / totalHours);
      memoKey = `payout:dispute:${dispute.id}`;
    } else {
      return NextResponse.json({ error: "dispute_orphaned" }, { status: 500 });
    }
    payoutUsdt = Math.round(payoutUsdt * 1e6) / 1e6;

    // Atomically claim the dispute. Only one caller wins; retries see 0.
    const claim = await prisma.dispute.updateMany({
      where: { id: dispute.id, status: "OPEN" },
      data: { status: "RESOLVING_FOR_HUMAN" },
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
        memoKey,
        toAddr: human.solanaPubkey,
        usdt: payoutUsdt,
        kind: "PAYOUT",
        taskId: task.id,
        slotId: slot.id,
        milestoneId: dispute.milestoneId ?? null,
        userId: human.id,
      });
      sig = res.signature;
    } catch (err) {
      console.error("[admin-dispute-resolve] payout failed", err);
      return NextResponse.json({ error: "payout_failed" }, { status: 502 });
    }

    // Finalize: mark slot/milestone PAID, dispute RESOLVED, bump reputation.
    await prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          status: "RESOLVED_FOR_HUMAN",
          resolution: parsed.data.resolution ?? null,
          resolvedAt: new Date(),
        },
      });
      if (dispute.slotId) {
        await tx.slot.update({
          where: { id: dispute.slotId },
          data: { status: "PAID", paidTxSig: sig },
        });
      } else if (dispute.milestoneId) {
        await tx.milestone.update({
          where: { id: dispute.milestoneId },
          data: { status: "PAID", approvedAt: new Date(), paidTxSig: sig },
        });
      }
      await tx.humanProfile.update({
        where: { userId: human.id },
        data: { completed: { increment: 1 } },
      });
    });
    return NextResponse.json({ ok: true, resolveFor: "HUMAN", txSignature: sig, payoutUsdt });
  }

  // Resolve for AI: dispute denied, slot/milestone stays REJECTED, no payout.
  await prisma.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: "RESOLVED_FOR_AI",
        resolution: parsed.data.resolution ?? null,
        resolvedAt: new Date(),
      },
    });
    if (dispute.slotId) {
      await tx.slot.update({
        where: { id: dispute.slotId },
        data: { status: "REJECTED" },
      });
    } else if (dispute.milestoneId) {
      await tx.milestone.update({
        where: { id: dispute.milestoneId },
        data: { status: "REJECTED" },
      });
    }
  });
  return NextResponse.json({ ok: true, resolveFor: "AI" });
}
