import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { loginChallengeSchema } from "@/lib/validation";
import { loginMessage } from "@/lib/solana/verify-signature";
import { CHALLENGE_COOKIE, CHALLENGE_TTL_SEC, encodeChallenge } from "@/lib/auth/login-challenge";
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
  const parsed = loginChallengeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { pubkey } = parsed.data;
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const exp = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SEC;

  const token = encodeChallenge({ pubkey, nonce, issuedAt, exp });
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL_SEC,
  });

  return NextResponse.json({
    message: loginMessage(nonce, issuedAt),
    nonce,
    issuedAt,
  });
}
