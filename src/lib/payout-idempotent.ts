import { Prisma, type TokenTxKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendPayout } from "@/lib/solana/payout";

export interface PayoutOnceInput {
  /** Deterministic idempotency key - also used as the on-chain memo. */
  memoKey: string;
  toAddr: string;
  usdt: number;
  kind: TokenTxKind;
  taskId?: string | null;
  slotId?: string | null;
  milestoneId?: string | null;
  userId?: string | null;
}

export interface PayoutOnceResult {
  signature: string;
  alreadySent: boolean;
}

/**
 * Idempotent USDT payout. The flow:
 *
 *  1. Insert a TokenTxLog row with `signature = null` and `memo = memoKey`.
 *     The `memo` column has a unique index, so two concurrent callers can't
 *     both proceed - one wins, the other catches a P2002 and we treat it as
 *     "already in progress / done".
 *  2. Call `sendPayout`. If it throws, the placeholder row stays (the operator
 *     can inspect / clean up via `signature IS NULL AND memo = ...`). A retry
 *     against the SAME memoKey will see the row and bail.
 *  3. On success, fill in the real signature.
 *
 * Callers MUST claim their domain row (slot, dispute, task) atomically with
 * `updateMany({ where: { status: PRIOR }, data: { status: INTERMEDIATE } })`
 * BEFORE invoking this helper, so a transient crash can be safely retried by
 * the operator after they reconcile on-chain.
 */
export async function payoutOnce(input: PayoutOnceInput): Promise<PayoutOnceResult> {
  // Step 1: reserve the idempotency slot.
  try {
    await prisma.tokenTxLog.create({
      data: {
        signature: null,
        kind: input.kind,
        fromAddr: process.env.SOLANA_ESCROW_PUBKEY!,
        toAddr: input.toAddr,
        amountUsdt: new Prisma.Decimal(input.usdt.toFixed(6)),
        memo: input.memoKey,
        taskId: input.taskId ?? null,
        slotId: input.slotId ?? null,
        milestoneId: input.milestoneId ?? null,
        userId: input.userId ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Another caller already started (or finished) this payout. If finished,
      // we can return the signature. If still in-flight, surface that.
      const existing = await prisma.tokenTxLog.findUnique({ where: { memo: input.memoKey } });
      if (existing?.signature) {
        return { signature: existing.signature, alreadySent: true };
      }
      throw new Error("payout_already_in_progress");
    }
    throw err;
  }

  // Step 2: send.
  const res = await sendPayout({
    toAddr: input.toAddr,
    usdt: input.usdt,
    memo: input.memoKey,
  });

  // Step 3: finalize the log row with the real signature.
  await prisma.tokenTxLog.update({
    where: { memo: input.memoKey },
    data: { signature: res.signature },
  });

  return { signature: res.signature, alreadySent: false };
}
