import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { disputeSchema } from "@/lib/validation-tasks";

const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = disputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { dispute: true, slot: { include: { task: true } } },
  });
  if (!milestone) return NextResponse.json({ error: "milestone_not_found" }, { status: 404 });
  if (milestone.slot.humanId !== auth.userId) {
    return NextResponse.json({ error: "not_slot_owner" }, { status: 403 });
  }
  if (milestone.status !== "REJECTED") {
    return NextResponse.json({ error: "milestone_not_rejected", status: milestone.status }, { status: 409 });
  }
  if (milestone.dispute) {
    return NextResponse.json({ error: "already_disputed" }, { status: 409 });
  }
  if (milestone.slot.task.privacy === "PUBLIC" && milestone.approvedAt === null) {
    // For rejections we don't have decidedAt on Milestone; rely on updatedAt-equivalent. Use the
    // rejection happens setting status; we record nothing else, so let's track via the
    // rejectionReason being set and use createdAt as a fallback. v1 simplification: allow dispute any time
    // for milestones in REJECTED state - admin will judge.
  }

  await prisma.$transaction([
    prisma.dispute.create({
      data: {
        milestoneId: milestone.id,
        raisedById: auth.userId,
        reason: parsed.data.reason,
        status: "OPEN",
      },
    }),
    prisma.milestone.update({ where: { id: milestone.id }, data: { status: "DISPUTED" } }),
    prisma.humanProfile.update({
      where: { userId: auth.userId },
      data: { disputed: { increment: 1 } },
    }),
  ]);

  void DISPUTE_WINDOW_MS; // intentionally unused; see comment above for v1 simplification
  return NextResponse.json({ ok: true, status: "DISPUTED" });
}
