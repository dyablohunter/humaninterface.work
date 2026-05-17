import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifySolanaSignature, apiRequestMessage } from "@/lib/solana/verify-signature";
import { isPubkeyBanned } from "@/lib/ban";
import { getSession, type SessionPayload } from "./session";

const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export interface AuthedRequest {
  userId: string;
  role: "HUMAN" | "AI";
  pubkey: string;
}

/**
 * Records `(pubkey, nonce)` in Postgres. Throws if it was used before -
 * caller must treat that as a replay and 401.
 */
async function consumeNonce(pubkey: string, nonce: string, expiresAt: Date): Promise<boolean> {
  try {
    await prisma.usedNonce.create({ data: { pubkey, nonce, expiresAt } });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return false;
    }
    throw err;
  }
}

/**
 * Verifies an AI's signed request. Expects headers:
 *   X-Solana-Pubkey, X-Solana-Signature, X-Nonce, X-Timestamp
 * The signed message includes the request body's sha256 hash.
 */
export async function authenticateAI(req: NextRequest, rawBody: string): Promise<AuthedRequest | NextResponse> {
  const pubkey = req.headers.get("x-solana-pubkey");
  const signature = req.headers.get("x-solana-signature");
  const nonce = req.headers.get("x-nonce");
  const timestamp = req.headers.get("x-timestamp");

  if (!pubkey || !signature || !nonce || !timestamp) {
    return NextResponse.json(
      { error: "missing_auth_headers", required: ["x-solana-pubkey", "x-solana-signature", "x-nonce", "x-timestamp"] },
      { status: 401 },
    );
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return NextResponse.json({ error: "stale_or_invalid_timestamp" }, { status: 401 });
  }

  const bodySha = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const url = new URL(req.url);
  const message = apiRequestMessage({
    method: req.method,
    path: url.pathname,
    nonce,
    timestamp,
    bodySha256Hex: bodySha,
  });

  const ok = verifySolanaSignature(new TextEncoder().encode(message), signature, pubkey);
  if (!ok) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (await isPubkeyBanned(pubkey)) {
    return NextResponse.json({ error: "account_banned" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { solanaPubkey: pubkey } });
  if (!user || !user.txVerified) {
    return NextResponse.json({ error: "unknown_or_unverified_account" }, { status: 401 });
  }
  if (user.banned) {
    return NextResponse.json({ error: "account_banned" }, { status: 403 });
  }
  if (user.suspended) {
    return NextResponse.json({ error: "account_suspended" }, { status: 403 });
  }
  if (user.role !== "AI") {
    return NextResponse.json({ error: "ai_role_required" }, { status: 403 });
  }

  // Replay protection: persistent, per-(pubkey, nonce) one-shot.
  const expiresAt = new Date(ts + NONCE_WINDOW_MS);
  const fresh = await consumeNonce(pubkey, nonce, expiresAt);
  if (!fresh) {
    return NextResponse.json({ error: "nonce_replayed" }, { status: 401 });
  }

  return { userId: user.id, role: user.role, pubkey: user.solanaPubkey };
}

/**
 * Authenticates a human user via the session cookie. Re-queries the user
 * row each call so suspends/bans take effect immediately.
 */
export async function authenticateHuman(): Promise<AuthedRequest | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.txVerified) {
    return NextResponse.json({ error: "unknown_or_unverified_account" }, { status: 401 });
  }
  if (user.banned) {
    return NextResponse.json({ error: "account_banned" }, { status: 403 });
  }
  if (user.suspended) {
    return NextResponse.json({ error: "account_suspended" }, { status: 403 });
  }
  if (user.role !== "HUMAN") {
    return NextResponse.json({ error: "human_role_required" }, { status: 403 });
  }
  return { userId: user.id, role: user.role, pubkey: user.solanaPubkey };
}

/**
 * Returns whichever side is authenticated (HUMAN cookie or AI signature).
 *
 * Importantly: an AI principal MUST NOT be admitted via cookie. The cookie
 * path is only valid for HUMAN sessions. AI requests must carry the per-
 * request wallet signature + replay nonce, so we fall through to
 * `authenticateAI` whenever the cookie isn't a fully-verified human.
 */
export async function authenticateAny(req: NextRequest, rawBody: string): Promise<AuthedRequest | NextResponse> {
  const session = await getSession();
  if (session && session.role === "HUMAN") {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user && user.txVerified && !user.suspended && !user.banned && user.role === "HUMAN") {
      return { userId: user.id, role: user.role, pubkey: user.solanaPubkey };
    }
  }
  return authenticateAI(req, rawBody);
}

export async function requireAdmin(): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  if (user.banned || user.suspended) {
    return NextResponse.json({ error: "admin_only" }, { status: 403 });
  }
  return session;
}
