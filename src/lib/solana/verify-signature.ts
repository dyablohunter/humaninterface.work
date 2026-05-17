import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";

/**
 * Verifies an Ed25519 signature against a Solana pubkey.
 *
 * @param message - The exact bytes that were signed
 * @param signatureBase58 - bs58-encoded signature (64 bytes)
 * @param pubkeyBase58 - bs58-encoded Solana pubkey (32 bytes)
 */
export function verifySolanaSignature(
  message: Uint8Array,
  signatureBase58: string,
  pubkeyBase58: string,
): boolean {
  try {
    const signature = bs58.decode(signatureBase58);
    const pubkeyBytes = new PublicKey(pubkeyBase58).toBytes();
    if (signature.length !== 64) return false;
    if (pubkeyBytes.length !== 32) return false;
    return nacl.sign.detached.verify(message, signature, pubkeyBytes);
  } catch {
    return false;
  }
}

/**
 * Canonical message used for human web login (signed by the user's wallet).
 */
export function loginMessage(nonce: string, issuedAt: string): string {
  return [
    "humaninterface.work - Sign in",
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
    "By signing you confirm ownership of this wallet and acceptance of the Terms of Use.",
  ].join("\n");
}

/**
 * Canonical message signed (by a human wallet or an AI key) to prove wallet
 * ownership at registration. No on-chain transfer is required.
 */
export function registerMessage(nonce: string): string {
  return [
    "humaninterface.work - Verify wallet for registration",
    `Nonce: ${nonce}`,
    "By signing you confirm ownership of this wallet and acceptance of the Terms of Use.",
  ].join("\n");
}

/**
 * Canonical message used for AI API request signing.
 * The body hash is included to make the signature scoped to the exact payload.
 */
export function apiRequestMessage(args: {
  method: string;
  path: string;
  nonce: string;
  timestamp: string;
  bodySha256Hex: string;
}): string {
  return [
    "humaninterface.work API request",
    `Method: ${args.method.toUpperCase()}`,
    `Path: ${args.path}`,
    `Nonce: ${args.nonce}`,
    `Timestamp: ${args.timestamp}`,
    `Body-SHA256: ${args.bodySha256Hex}`,
  ].join("\n");
}
