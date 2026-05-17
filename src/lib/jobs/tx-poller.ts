import { PublicKey } from "@solana/web3.js";
import { prisma } from "@/lib/db";
import { solanaConnection, getEscrowUsdtAta } from "@/lib/solana/client";
import { fetchUsdtTransfer } from "@/lib/solana/verify-tx";
import { Prisma } from "@prisma/client";

const TOLERANCE_PCT = 0.01;
const FETCH_LIMIT = 50;
let cursor: string | undefined; // last seen signature, to bound the next fetch

/**
 * Polls the escrow USDT ATA for fresh inbound USDT (SPL token) transfers and
 * tries to match them by memo to:
 *   - Task IDs in status PENDING_DEPOSIT → flips to OPEN
 *   - Milestone memos (taskId/mN/slotId) in status PENDING_DEPOSIT → flips to CLAIMED
 *
 * Provides the same effect as the explicit /confirm-deposit routes without
 * requiring the AI to call them. Both code paths are idempotent via
 * TokenTxLog.signature.
 */
export async function pollDeposits(): Promise<number> {
  const escrowAddr = process.env.SOLANA_ESCROW_PUBKEY;
  if (!escrowAddr) return 0;

  // We watch the escrow USDT ATA, not the owner wallet, because that's where
  // SPL token transfers land.
  let escrowAta: PublicKey;
  try {
    escrowAta = getEscrowUsdtAta();
  } catch {
    return 0;
  }

  const sigs = await solanaConnection.getSignaturesForAddress(
    escrowAta,
    { limit: FETCH_LIMIT, until: cursor },
    "confirmed",
  );
  if (sigs.length === 0) return 0;
  cursor = sigs[0]?.signature ?? cursor;

  let handled = 0;
  for (const entry of sigs) {
    if (entry.err) continue;
    const sig = entry.signature;

    // Idempotent: skip TXs we've already logged.
    const dupe = await prisma.tokenTxLog.findUnique({ where: { signature: sig } });
    if (dupe) continue;

    const tx = await fetchUsdtTransfer(sig);
    if (!tx) continue;
    if (tx.toOwner !== escrowAddr) continue;
    if (!tx.memo) continue;

    const memo = tx.memo.trim();
    if (memo.includes("/m") && memo.split("/").length >= 3) {
      // Milestone deposit memo: taskId/mN/slotId
      const handledMs = await tryMatchMilestone(memo, sig, tx);
      if (handledMs) handled++;
    } else {
      // Task deposit memo: bare task ID
      const handledTask = await tryMatchTask(memo, sig, tx);
      if (handledTask) handled++;
    }
  }
  return handled;
}

async function tryMatchTask(
  memo: string,
  signature: string,
  tx: { fromOwner: string; toOwner: string; usdt: number; memo: string | null },
): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: memo },
    include: { poster: true },
  });
  if (!task) return false;
  if (task.status !== "PENDING_DEPOSIT") return false;
  if (task.expiresAt < new Date()) return false;
  if (tx.fromOwner !== task.poster.solanaPubkey) return false;
  const required = Number(task.totalUsdt);
  if (tx.usdt < required * (1 - TOLERANCE_PCT)) return false;

  const fundedAt = new Date();
  const biddingClosesAt = new Date(fundedAt.getTime() + task.biddingHours * 60 * 60 * 1000);
  try {
    await prisma.$transaction([
      prisma.task.update({
        where: { id: task.id },
        data: { status: "OPEN", fundedAt, escrowTxSig: signature, biddingClosesAt },
      }),
      prisma.tokenTxLog.create({
        data: {
          signature,
          kind: "ESCROW_DEPOSIT",
          fromAddr: tx.fromOwner,
          toAddr: tx.toOwner,
          amountUsdt: new Prisma.Decimal(tx.usdt.toFixed(6)) as unknown as Prisma.Decimal,
          memo,
          taskId: task.id,
          userId: task.posterId,
        },
      }),
    ]);
    return true;
  } catch (err) {
    console.error("[tx-poller] task match write failed", err);
    return false;
  }
}

async function tryMatchMilestone(
  memo: string,
  signature: string,
  tx: { fromOwner: string; toOwner: string; usdt: number; memo: string | null },
): Promise<boolean> {
  // memo format: <taskId>/m<seq>/<slotId>
  const m = /^([^/]+)\/m(\d+)\/(.+)$/.exec(memo);
  if (!m) return false;
  const [, taskId, seqStr, slotId] = m;
  const seq = Number(seqStr);
  if (!Number.isFinite(seq)) return false;

  const milestone = await prisma.milestone.findFirst({
    where: { taskId, slotId, sequenceNum: seq, status: "PENDING_DEPOSIT" },
    include: { slot: { include: { task: { include: { poster: true } } } } },
  });
  if (!milestone) return false;
  if (!milestone.usdtAmount || !milestone.expiresAt) return false;
  if (milestone.expiresAt < new Date()) return false;
  if (tx.fromOwner !== milestone.slot.task.poster.solanaPubkey) return false;
  if (tx.usdt < Number(milestone.usdtAmount) * (1 - TOLERANCE_PCT)) return false;

  try {
    await prisma.$transaction([
      prisma.milestone.update({
        where: { id: milestone.id },
        data: { status: "CLAIMED", escrowTxSig: signature },
      }),
      prisma.tokenTxLog.create({
        data: {
          signature,
          kind: "ESCROW_DEPOSIT",
          fromAddr: tx.fromOwner,
          toAddr: tx.toOwner,
          amountUsdt: new Prisma.Decimal(tx.usdt.toFixed(6)) as unknown as Prisma.Decimal,
          memo,
          taskId,
          slotId,
          milestoneId: milestone.id,
          userId: milestone.slot.task.posterId,
        },
      }),
    ]);
    return true;
  } catch (err) {
    console.error("[tx-poller] milestone match write failed", err);
    return false;
  }
}
