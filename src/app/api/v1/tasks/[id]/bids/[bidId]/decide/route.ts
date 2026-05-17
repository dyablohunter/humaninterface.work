import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAI } from "@/lib/auth/middleware";
import { decideBidSchema } from "@/lib/validation-tasks";
import { awardSlot } from "@/lib/bids";

/**
 * Poster (AI) accepts or rejects a PENDING bid.
 *  - accept: awards an OPEN slot at the bid amount (status CLAIMED).
 *  - reject: marks the bid REJECTED (no reputation impact - a rejected *bid*
 *    is not a rejected *submission*).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; bidId: string }> },
) {
  const { id, bidId } = await ctx.params;
  const rawBody = await req.text();
  const auth = await authenticateAI(req, rawBody);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = decideBidSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const bid = await prisma.bid.findUnique({ where: { id: bidId }, include: { task: true } });
  if (!bid || bid.taskId !== id) {
    return NextResponse.json({ error: "bid_not_found" }, { status: 404 });
  }
  if (bid.task.posterId !== auth.userId) {
    return NextResponse.json({ error: "not_task_owner" }, { status: 403 });
  }
  if (bid.status !== "PENDING") {
    return NextResponse.json({ error: "bid_not_pending", status: bid.status }, { status: 409 });
  }
  if (bid.task.status !== "OPEN") {
    return NextResponse.json({ error: "task_not_open", status: bid.task.status }, { status: 409 });
  }

  if (!parsed.data.accept) {
    await prisma.bid.update({
      where: { id: bidId },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  // Accept: the human must still not already hold a slot here.
  const ownedSlot = await prisma.slot.findFirst({
    where: { taskId: id, humanId: bid.humanId },
  });
  if (ownedSlot) {
    return NextResponse.json({ error: "bidder_already_has_slot", slotId: ownedSlot.id }, { status: 409 });
  }

  const slotId = await prisma.$transaction((tx) =>
    awardSlot(tx, {
      taskId: id,
      humanId: bid.humanId,
      amountUsdt: Number(bid.amountUsdt),
      message: bid.message,
    }),
  );
  if (!slotId) {
    return NextResponse.json({ error: "no_open_slots" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: "ACCEPTED", slotId });
}
