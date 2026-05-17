import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { registerVerifySchema } from "@/lib/validation";
import { verifySolanaSignature, registerMessage } from "@/lib/solana/verify-signature";
import { setSessionCookie } from "@/lib/auth/session";

/**
 * Confirm wallet ownership by verifying an Ed25519 signature over the
 * registration nonce. No on-chain transfer is required.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = registerVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { pubkey, signature } = parsed.data;

  const user = await prisma.user.findUnique({ where: { solanaPubkey: pubkey } });
  if (!user || !user.verifyNonce) {
    return NextResponse.json({ error: "unknown_pubkey_or_already_verified" }, { status: 404 });
  }
  if (user.txVerified) {
    return NextResponse.json({ error: "already_verified" }, { status: 409 });
  }

  const message = new TextEncoder().encode(registerMessage(user.verifyNonce));
  if (!verifySolanaSignature(message, signature, pubkey)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { txVerified: true, verifyNonce: null },
  });

  // For humans: issue a session immediately so they land logged in.
  if (user.role === "HUMAN") {
    await setSessionCookie({ userId: user.id, role: "HUMAN" });
  }

  return NextResponse.json({ ok: true, role: user.role, username: user.username });
}
