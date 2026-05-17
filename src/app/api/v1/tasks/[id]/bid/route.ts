import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { bidSchema } from "@/lib/validation-tasks";
import { checkBidEligibility, awardSlot } from "@/lib/bids";

/**
 * Human places a reverse-auction bid on a task.
 *
 *  - amountUsdt must be ≤ task.statedPriceUsdt.
 *  - If amountUsdt ≤ task.instantAcceptUsdt AND an OPEN slot exists, the bid
 *    is auto-accepted and a slot is awarded immediately (status CLAIMED).
 *  - Otherwise the bid is stored PENDING for the AI to decide.
 *
 * One bid per (task, human). Re-bidding while PENDING updates the amount.
 */
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
  const parsed = bidSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { amountUsdt, message } = parsed.data;

  const elig = await checkBidEligibility(id, auth.userId);
  if (!elig.ok) {
    return NextResponse.json({ error: elig.error }, { status: elig.status });
  }
  const task = elig.task;

  // Reverse-auction bidding window closed: no new bids and no re-bids accepted.
  // The worker will (or already did) auto-accept the lowest qualifying bid.
  if (task.biddingClosesAt && task.biddingClosesAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "bidding_closed" }, { status: 400 });
  }

  const statedPriceUsdt = Number(task.statedPriceUsdt);
  const instantAcceptUsdt = Number(task.instantAcceptUsdt);

  if (amountUsdt > statedPriceUsdt) {
    return NextResponse.json(
      { error: "bid_exceeds_stated_price", statedPriceUsdt },
      { status: 400 },
    );
  }

  // Already awarded a slot on this task?
  const ownedSlot = await prisma.slot.findFirst({
    where: { taskId: id, humanId: auth.userId },
  });
  if (ownedSlot) {
    return NextResponse.json({ error: "already_awarded_a_slot", slotId: ownedSlot.id }, { status: 409 });
  }

  const autoAccept = amountUsdt <= instantAcceptUsdt;

  if (autoAccept) {
    const slotId = await prisma.$transaction((tx) =>
      awardSlot(tx, { taskId: id, humanId: auth.userId, amountUsdt, message }),
    );
    if (!slotId) {
      // No open slot - fall back to a pending bid so the AI can still pick them.
      const bid = await upsertPendingBid(id, auth.userId, amountUsdt, message);
      return NextResponse.json(
        { ok: true, status: "PENDING", bidId: bid.id, note: "no_open_slot_bid_queued" },
        { status: 202 },
      );
    }
    return NextResponse.json({ ok: true, status: "ACCEPTED", slotId });
  }

  const bid = await upsertPendingBid(id, auth.userId, amountUsdt, message);
  return NextResponse.json({ ok: true, status: "PENDING", bidId: bid.id });
}

async function upsertPendingBid(
  taskId: string,
  humanId: string,
  amountUsdt: number,
  message?: string | null,
) {
  return prisma.bid.upsert({
    where: { taskId_humanId: { taskId, humanId } },
    create: { taskId, humanId, amountUsdt, message: message ?? null, status: "PENDING" },
    update: { amountUsdt, message: message ?? null, status: "PENDING" },
  });
}
