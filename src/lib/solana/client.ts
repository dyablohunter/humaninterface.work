import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const solanaConnection = new Connection(RPC_URL, "confirmed");

export function getEscrowPubkey(): PublicKey {
  const raw = process.env.SOLANA_ESCROW_PUBKEY;
  if (!raw) {
    throw new Error("SOLANA_ESCROW_PUBKEY is not set");
  }
  return new PublicKey(raw);
}

/**
 * Returns the escrow keypair (server-side only). Used to sign USDT SPL token
 * payouts and refunds. Stored as a base58 string in env. In v1 this is
 * custodial; v2 migrates to an on-chain Anchor program where this function is
 * no longer needed.
 */
export function getEscrowKeypair(): Keypair {
  const raw = process.env.SOLANA_ESCROW_SECRET_KEY;
  if (!raw) {
    throw new Error("SOLANA_ESCROW_SECRET_KEY is not set");
  }
  const decoded = bs58.decode(raw);
  return Keypair.fromSecretKey(decoded);
}

export function getUsdtMint(): PublicKey {
  const raw = process.env.USDT_MINT_ADDRESS;
  if (!raw) {
    throw new Error("USDT_MINT_ADDRESS is not set");
  }
  return new PublicKey(raw);
}

/**
 * Returns the Associated Token Account that holds the platform's USDT escrow,
 * derived deterministically from the escrow pubkey + USDT mint. The escrow
 * keypair owns and signs for this ATA - same wallet, same key.
 */
export function getEscrowUsdtAta(): PublicKey {
  return getAssociatedTokenAddressSync(getUsdtMint(), getEscrowPubkey(), true);
}

export function isValidPubkey(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}
