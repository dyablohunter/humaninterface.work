import { createHash, randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { prisma } from "@/lib/db";
import { apiRequestMessage } from "@/lib/solana/verify-signature";

/**
 * The admin Testing tab needs a real Solana keypair to drive the AI-signed
 * endpoints end-to-end. The keypair lives in `.env` (TEST_AI_*); the matching
 * `User` row is provisioned on demand. This is dev/test only - never enable
 * in production deployments.
 */

export function getTestAiCreds(): {
  username: string;
  pubkey: string;
  secret: string;
} {
  const username = process.env.TEST_AI_USERNAME || "test_ai";
  const pubkey = process.env.TEST_AI_PUBKEY;
  const secret = process.env.TEST_AI_SECRET_KEY;
  if (!pubkey || !secret) {
    throw new Error("TEST_AI_PUBKEY / TEST_AI_SECRET_KEY are not configured");
  }
  return { username, pubkey, secret };
}

export function getTestAiKeypair(): Keypair {
  const { secret } = getTestAiCreds();
  return Keypair.fromSecretKey(bs58.decode(secret));
}

/** Ensure the test_ai User row exists and matches the env keypair. */
export async function ensureTestAiUser(): Promise<{ id: string; username: string; pubkey: string }> {
  const { username, pubkey } = getTestAiCreds();

  const existing = await prisma.user.findUnique({ where: { solanaPubkey: pubkey } });
  if (existing) {
    return { id: existing.id, username: existing.username, pubkey };
  }

  // Reuse the username if it's already on a stale row (e.g. mock seed) by
  // re-pointing it to the configured pubkey; otherwise create fresh.
  const byUsername = await prisma.user.findUnique({ where: { username } });
  if (byUsername) {
    const updated = await prisma.user.update({
      where: { id: byUsername.id },
      data: {
        solanaPubkey: pubkey,
        role: "AI",
        txVerified: true,
        suspended: false,
        banned: false,
      },
    });
    return { id: updated.id, username: updated.username, pubkey };
  }

  const created = await prisma.user.create({
    data: {
      username,
      solanaPubkey: pubkey,
      role: "AI",
      txVerified: true,
      tosAcceptedAt: new Date(),
      tosVersion: process.env.TOS_VERSION || "test",
    },
  });
  return { id: created.id, username: created.username, pubkey };
}

/**
 * Builds the four signed headers an AI client uses against `/api/v1/*`.
 * Matches the canonical message shape in [src/lib/solana/verify-signature.ts].
 */
export function signTestAiRequest(input: {
  method: string;
  path: string;
  rawBody: string;
}): Record<string, string> {
  const kp = getTestAiKeypair();
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();
  const bodySha = createHash("sha256").update(input.rawBody, "utf8").digest("hex");
  const message = apiRequestMessage({
    method: input.method.toUpperCase(),
    path: input.path,
    nonce,
    timestamp,
    bodySha256Hex: bodySha,
  });
  const sig = nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey);
  return {
    "X-Solana-Pubkey": kp.publicKey.toBase58(),
    "X-Solana-Signature": bs58.encode(sig),
    "X-Nonce": nonce,
    "X-Timestamp": timestamp,
  };
}
