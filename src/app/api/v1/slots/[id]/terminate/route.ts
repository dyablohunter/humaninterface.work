import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";

const MILESTONE_GAP_TERMINATION_MS = 48 * 60 * 60 * 1000;

/**
 * Human terminates a JOB slot when the AI has gone silent for 48+ hours
 * since the last approved milestone - meaning the AI failed to deposit the
 * next milestone's escrow within the 24h grace period.
 *
 * Under the per-milestone funding model: future milestones were never escrowed
 * for this slot, so termination doesn't require a refund payout. Past milestones
 * (PAID) are already settled. This just transitions the slot to a terminal state
 * and lets the human stop waiting.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  const slot = await prisma.slot.findUnique({
    where: { id },
    include: { task: true, milestones: true },
  });
  if (!slot) return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  if (slot.humanId !== auth.userId) {
    return NextResponse.json({ error: "not_slot_owner" }, { status: 403 });
  }
  if (slot.task.type !== "JOB") {
    return NextResponse.json({ error: "terminate_is_for_jobs_only" }, { status: 400 });
  }
  if (slot.status !== "CLAIMED") {
    return NextResponse.json({ error: "slot_not_active", status: slot.status }, { status: 409 });
  }

  // Block if there's an active milestone (PENDING_DEPOSIT means AI created+is funding;
  // CLAIMED/SUBMITTED/DISPUTED means work is in flight).
  const active = slot.milestones.find(
    (m) =>
      m.status === "PENDING_DEPOSIT" ||
      m.status === "CLAIMED" ||
      m.status === "SUBMITTED" ||
      m.status === "DISPUTED",
  );
  if (active) {
    return NextResponse.json(
      { error: "milestone_in_progress", milestoneId: active.id, status: active.status },
      { status: 409 },
    );
  }

  const paidMilestones = slot.milestones.filter((m) => m.status === "PAID");
  if (paidMilestones.length === 0) {
    return NextResponse.json({ error: "no_milestones_approved_yet" }, { status: 409 });
  }
  const lastApprovedAt = paidMilestones.reduce<Date | null>(
    (latest, m) => (m.approvedAt && (!latest || m.approvedAt > latest) ? m.approvedAt : latest),
    null,
  );
  if (!lastApprovedAt) {
    return NextResponse.json({ error: "missing_last_approved_at" }, { status: 500 });
  }
  const elapsed = Date.now() - lastApprovedAt.getTime();
  if (elapsed < MILESTONE_GAP_TERMINATION_MS) {
    return NextResponse.json(
      { error: "too_soon_to_terminate", elapsedMs: elapsed, requiredMs: MILESTONE_GAP_TERMINATION_MS },
      { status: 409 },
    );
  }

  const consumedHours = paidMilestones.reduce((s, m) => s + m.hoursForDay, 0);
  const totalHours = slot.task.estimatedMinutes / 60;

  await prisma.$transaction([
    prisma.slot.update({
      where: { id: slot.id },
      data: { status: "PAID" }, // terminal - consumed-hours payouts already happened per-milestone
    }),
    prisma.humanProfile.update({
      where: { userId: auth.userId },
      data: { completed: { increment: 1 } },
    }),
    prisma.auditLog.create({
      data: {
        userId: auth.userId,
        action: "SLOT_TERMINATE_MILESTONE_GAP",
        payload: {
          slotId: slot.id,
          taskId: slot.taskId,
          consumedHours,
          totalHours,
          elapsedMsSinceLastApproval: elapsed,
        },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    slotId: slot.id,
    status: "PAID",
    consumedHours,
    totalHours,
    remainingHours: Math.max(0, totalHours - consumedHours),
  });
}
