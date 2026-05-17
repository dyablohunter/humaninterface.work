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
  const { reason } = parsed.data;

  const slot = await prisma.slot.findUnique({
    where: { id },
    include: { dispute: true, task: true },
  });
  if (!slot) return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  if (slot.humanId !== auth.userId) {
    return NextResponse.json({ error: "not_slot_owner" }, { status: 403 });
  }
  if (slot.status !== "REJECTED") {
    return NextResponse.json({ error: "slot_not_rejected", status: slot.status }, { status: 409 });
  }
  if (slot.dispute) {
    return NextResponse.json({ error: "already_disputed" }, { status: 409 });
  }
  // Enforce 24h window for public tasks. Private tasks have no time limit.
  if (slot.task.privacy === "PUBLIC" && slot.decidedAt) {
    const elapsed = Date.now() - slot.decidedAt.getTime();
    if (elapsed > DISPUTE_WINDOW_MS) {
      return NextResponse.json({ error: "dispute_window_expired" }, { status: 410 });
    }
  }

  await prisma.$transaction([
    prisma.dispute.create({
      data: {
        slotId: slot.id,
        raisedById: auth.userId,
        reason,
        status: "OPEN",
      },
    }),
    prisma.slot.update({ where: { id: slot.id }, data: { status: "DISPUTED" } }),
    prisma.humanProfile.update({
      where: { userId: auth.userId },
      data: { disputed: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({ ok: true, status: "DISPUTED" });
}
