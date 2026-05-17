import { solanaConnection, getUsdtMint } from "./client";
import type { ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const SPL_TOKEN_PROGRAM = "spl-token";

export interface FetchedUsdtTx {
  signature: string;
  fromOwner: string; // owner of the source token account
  toOwner: string;   // owner of the destination token account
  usdt: number;      // human-readable decimal (raw / 10^6)
  memo: string | null;
  blockTime: number | null;
}

/**
 * Fetches a USDT (SPL token) transfer transaction and extracts the canonical
 * fields we care about: sender owner, recipient owner, USDT amount, memo.
 *
 * Parses transferChecked / transfer instructions on the spl-token program,
 * validates the mint matches USDT_MINT_ADDRESS, and resolves token-account
 * addresses back to their owners via meta.preTokenBalances /
 * postTokenBalances (parsed `transfer` only gives ATA addresses, not owners).
 *
 * Returns null if the TX is not a USDT SPL transfer or cannot be decoded.
 */
export async function fetchUsdtTransfer(signature: string): Promise<FetchedUsdtTx | null> {
  const tx: ParsedTransactionWithMeta | null = await solanaConnection.getParsedTransaction(
    signature,
    { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  );
  if (!tx || !tx.meta || tx.meta.err) return null;

  const mintAddr = (() => {
    try {
      return getUsdtMint().toBase58();
    } catch {
      return null;
    }
  })();
  if (!mintAddr) return null;

  const message = tx.transaction.message;
  let sourceAta: string | null = null;
  let destAta: string | null = null;
  let rawAmount: bigint = BigInt(0);
  let memo: string | null = null;

  for (const ix of message.instructions) {
    if ("parsed" in ix && ix.program === SPL_TOKEN_PROGRAM) {
      const info = ix.parsed?.info as
        | {
            source?: string;
            destination?: string;
            mint?: string;
            tokenAmount?: { amount: string; decimals: number };
            amount?: string;
            authority?: string;
          }
        | undefined;
      if (!info) continue;
      if (ix.parsed.type === "transferChecked") {
        if (info.mint !== mintAddr) continue;
        sourceAta = info.source ?? null;
        destAta = info.destination ?? null;
        rawAmount = BigInt(info.tokenAmount?.amount ?? "0");
      } else if (ix.parsed.type === "transfer") {
        // Plain transfer: mint isn't in the instruction. Validate via pre/post balances below.
        sourceAta = info.source ?? null;
        destAta = info.destination ?? null;
        rawAmount = BigInt(info.amount ?? "0");
      }
    }
    if (
      "programId" in ix &&
      (ix.programId as PublicKey).toBase58() === MEMO_PROGRAM_ID
    ) {
      if ("parsed" in ix && typeof ix.parsed === "string") {
        memo = ix.parsed;
      } else if ("data" in ix && typeof (ix as { data?: string }).data === "string") {
        try {
          memo = Buffer.from((ix as { data: string }).data, "base64").toString("utf8");
        } catch {
          // ignore
        }
      }
    }
  }

  if (!sourceAta || !destAta || rawAmount <= BigInt(0)) return null;

  // Resolve ATA -> owner and verify the mint via pre/postTokenBalances.
  const accountKeys = message.accountKeys.map((k) =>
    typeof k === "string" ? k : k.pubkey.toBase58(),
  );
  const balances = [
    ...(tx.meta.preTokenBalances ?? []),
    ...(tx.meta.postTokenBalances ?? []),
  ];
  const lookupOwner = (ata: string): string | null => {
    const idx = accountKeys.indexOf(ata);
    if (idx < 0) return null;
    const entry = balances.find((b) => b.accountIndex === idx);
    if (!entry) return null;
    if (entry.mint !== mintAddr) return null;
    return entry.owner ?? null;
  };
  const fromOwner = lookupOwner(sourceAta);
  const toOwner = lookupOwner(destAta);
  if (!fromOwner || !toOwner) return null;

  return {
    signature,
    fromOwner,
    toOwner,
    usdt: Number(rawAmount) / 10 ** 6,
    memo,
    blockTime: tx.blockTime ?? null,
  };
}

/**
 * Checks whether the given Solana account has any positive SOL balance.
 * Used during registration to confirm the user actually controls a funded
 * wallet (network-fee capable). Unrelated to USDT.
 */
export async function hasPositiveBalance(pubkey: string): Promise<boolean> {
  try {
    const { PublicKey } = await import("@solana/web3.js");
    const balance = await solanaConnection.getBalance(new PublicKey(pubkey), "confirmed");
    return balance > 0;
  } catch {
    return false;
  }
}
