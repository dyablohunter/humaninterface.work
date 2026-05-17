import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAI } from "@/lib/auth/middleware";
import { createMilestoneSchema } from "@/lib/validation-tasks";

/**
 * Create the next milestone for a JOB slot.
 *
 * In the reverse-auction model the whole job slot is funded upfront from the
 * task escrow (statedPriceUsdt × slotCount × 1.05). Milestones simply chunk
 * the work for daily review - there is NO per-milestone deposit anymore. Each
 * milestone pays a fraction of the winning bid (awardedUsdt) proportional to
 * hoursForDay / total estimated hours, settled at /milestones/:id/decide.
 *
 * Milestones are created sequentially; only one may be in flight per slot.
 */
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
  const parsed = createMilestoneSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const slot = await prisma.slot.findUnique({
    where: { id },
    include: { task: true, milestones: true },
  });
  if (!slot) return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  if (slot.task.posterId !== auth.userId) {
    return NextResponse.json({ error: "not_task_owner" }, { status: 403 });
  }
  if (slot.task.type !== "JOB") {
    return NextResponse.json({ error: "milestones_are_for_jobs_only" }, { status: 400 });
  }
  if (slot.status !== "CLAIMED") {
    return NextResponse.json({ error: "slot_not_claimed", status: slot.status }, { status: 409 });
  }

  // Validate cumulative milestone hours don't exceed the slot's allotment.
  const consumed = slot.milestones.reduce(
    (sum, m) =>
      m.status === "CLAIMED" || m.status === "SUBMITTED" || m.status === "APPROVED" || m.status === "PAID"
        ? sum + m.hoursForDay
        : sum,
    0,
  );
  const totalHours = slot.task.estimatedMinutes / 60;
  const remaining = totalHours - consumed;
  if (parsed.data.hoursForDay > remaining + 0.001) {
    return NextResponse.json(
      { error: "hours_exceed_remaining", remaining, requested: parsed.data.hoursForDay },
      { status: 400 },
    );
  }

  const openExisting = slot.milestones.find(
    (m) => m.status === "CLAIMED" || m.status === "SUBMITTED" || m.status === "DISPUTED",
  );
  if (openExisting) {
    return NextResponse.json(
      { error: "milestone_already_in_progress", milestoneId: openExisting.id, status: openExisting.status },
      { status: 409 },
    );
  }

  const nextSeq = slot.milestones.reduce((m, c) => (c.sequenceNum > m ? c.sequenceNum : m), 0) + 1;

  const created = await prisma.milestone.create({
    data: {
      taskId: slot.taskId,
      slotId: slot.id,
      sequenceNum: nextSeq,
      hoursForDay: parsed.data.hoursForDay,
      status: "CLAIMED",
    },
  });

  return NextResponse.json({
    ok: true,
    milestoneId: created.id,
    sequenceNum: nextSeq,
    status: "CLAIMED",
    hoursForDay: parsed.data.hoursForDay,
    remainingHoursAfter: Math.round((remaining - parsed.data.hoursForDay) * 100) / 100,
  });
}
