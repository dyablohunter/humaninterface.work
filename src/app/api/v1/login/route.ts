import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import { verifySolanaSignature, loginMessage } from "@/lib/solana/verify-signature";
import { setSessionCookie } from "@/lib/auth/session";
import { decodeChallenge, CHALLENGE_COOKIE } from "@/lib/auth/login-challenge";
import { checkSameOrigin } from "@/lib/auth/csrf";

export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { pubkey, signature } = parsed.data;

  const cookieStore = await cookies();
  const c = cookieStore.get(CHALLENGE_COOKIE);
  if (!c) {
    return NextResponse.json({ error: "no_challenge" }, { status: 400 });
  }
  const challenge = decodeChallenge(c.value);
  if (!challenge) {
    cookieStore.delete(CHALLENGE_COOKIE);
    return NextResponse.json({ error: "invalid_or_expired_challenge" }, { status: 400 });
  }
  if (challenge.pubkey !== pubkey) {
    return NextResponse.json({ error: "challenge_pubkey_mismatch" }, { status: 400 });
  }

  const message = new TextEncoder().encode(loginMessage(challenge.nonce, challenge.issuedAt));
  if (!verifySolanaSignature(message, signature, pubkey)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { solanaPubkey: pubkey } });
  if (!user) {
    return NextResponse.json({ error: "unknown_account" }, { status: 404 });
  }
  if (!user.txVerified) {
    return NextResponse.json({ error: "account_not_verified" }, { status: 403 });
  }
  if (user.suspended) {
    return NextResponse.json({ error: "account_suspended" }, { status: 403 });
  }
  if (user.role !== "HUMAN") {
    return NextResponse.json({ error: "cookie_login_for_humans_only" }, { status: 403 });
  }

  cookieStore.delete(CHALLENGE_COOKIE);
  await setSessionCookie({ userId: user.id, role: user.role });

  return NextResponse.json({ ok: true, username: user.username });
}
