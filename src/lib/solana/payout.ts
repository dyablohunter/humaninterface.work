import { PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createMemoInstruction } from "@solana/spl-memo";
import { solanaConnection, getEscrowKeypair, getUsdtMint } from "./client";

export const USDT_DECIMALS = 6;

export interface PayoutInput {
  toAddr: string;
  usdt: number;
  memo?: string;
}

export interface PayoutResult {
  signature: string;
  fromAddr: string; // escrow owner pubkey (base58)
  toAddr: string;   // recipient owner pubkey (base58), NOT the ATA
  usdt: number;
}

/**
 * Sends a USDT (SPL token) transfer from the platform escrow ATA to the
 * recipient's USDT ATA. The recipient ATA is created idempotently (paid by
 * escrow) if it doesn't already exist. Used for payouts (to humans) and
 * refunds (back to AI).
 */
export async function sendPayout(input: PayoutInput): Promise<PayoutResult> {
  if (input.usdt <= 0) throw new Error("payout_amount_must_be_positive");

  const escrow = getEscrowKeypair();
  const mint = getUsdtMint();
  const recipientOwner = new PublicKey(input.toAddr);

  const fromAta = getAssociatedTokenAddressSync(mint, escrow.publicKey, true);
  const toAta = getAssociatedTokenAddressSync(mint, recipientOwner, true);

  const amount = BigInt(Math.round(input.usdt * 10 ** USDT_DECIMALS));

  const tx = new Transaction();
  // Create recipient ATA idempotently (no-op if it already exists).
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      escrow.publicKey,
      toAta,
      recipientOwner,
      mint,
    ),
  );
  tx.add(
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      escrow.publicKey,
      amount,
      USDT_DECIMALS,
    ),
  );
  if (input.memo) {
    tx.add(createMemoInstruction(input.memo, [escrow.publicKey]));
  }

  const signature = await sendAndConfirmTransaction(solanaConnection, tx, [escrow], {
    commitment: "confirmed",
  });

  return {
    signature,
    fromAddr: escrow.publicKey.toBase58(),
    toAddr: recipientOwner.toBase58(),
    usdt: input.usdt,
  };
}
