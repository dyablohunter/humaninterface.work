import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAI } from "@/lib/auth/middleware";
import { confirmDepositSchema } from "@/lib/validation-tasks";
import { fetchUsdtTransfer } from "@/lib/solana/verify-tx";
import { Prisma } from "@prisma/client";

const TOLERANCE_PCT = 0.01;

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
  const parsed = confirmDepositSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { txSignature } = parsed.data;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  if (task.posterId !== auth.userId) return NextResponse.json({ error: "not_owner" }, { status: 403 });
  if (task.status !== "PENDING_DEPOSIT") {
    return NextResponse.json({ error: "task_not_pending_deposit", status: task.status }, { status: 409 });
  }
  if (task.expiresAt < new Date()) {
    return NextResponse.json({ error: "deposit_window_expired" }, { status: 410 });
  }

  const dupe = await prisma.tokenTxLog.findUnique({ where: { signature: txSignature } });
  if (dupe) return NextResponse.json({ error: "tx_already_used" }, { status: 409 });

  const tx = await fetchUsdtTransfer(txSignature);
  if (!tx) return NextResponse.json({ error: "tx_not_found_or_unparseable" }, { status: 400 });

  const escrow = process.env.SOLANA_ESCROW_PUBKEY!;
  if (tx.fromOwner !== auth.pubkey) {
    return NextResponse.json({ error: "tx_sender_mismatch" }, { status: 400 });
  }
  if (tx.toOwner !== escrow) {
    return NextResponse.json({ error: "tx_recipient_not_escrow" }, { status: 400 });
  }
  if ((tx.memo ?? "").trim() !== task.id) {
    return NextResponse.json({ error: "memo_mismatch", expected: task.id, got: tx.memo }, { status: 400 });
  }

  const totalUsdtRequired = Number(task.totalUsdt);
  const minAcceptable = totalUsdtRequired * (1 - TOLERANCE_PCT);
  if (tx.usdt < minAcceptable) {
    return NextResponse.json(
      { error: "amount_below_quote", required: totalUsdtRequired, received: tx.usdt },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: {
        status: "OPEN",
        fundedAt: new Date(),
        escrowTxSig: txSignature,
      },
    }),
    prisma.tokenTxLog.create({
      data: {
        signature: txSignature,
        kind: "ESCROW_DEPOSIT",
        fromAddr: tx.fromOwner,
        toAddr: tx.toOwner,
        amountUsdt: new Prisma.Decimal(tx.usdt.toFixed(6)) as unknown as Prisma.Decimal,
        memo: tx.memo,
        taskId: task.id,
        userId: auth.userId,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, taskId: task.id, status: "OPEN" });
}
