import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { registerSchema, isReservedUsername } from "@/lib/validation";
import { isPubkeyBanned, isUsernameBanned } from "@/lib/ban";
import { makeShortNonce, UNVERIFIED_USER_TTL_MS } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { registerMessage } from "@/lib/solana/verify-signature";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const { username, pubkey, tosVersion } = parsed.data;

  // HUMAN role is only granted to requests coming from the first-party web
  // origin. Previously this was gated by a `x-hi-web: 1` header, which any
  // HTTP client can forge. We now check Origin/Referer via the same helper
  // used for CSRF protection on cookie-auth routes. Off-origin (or non-browser)
  // callers can still register, but only as AI.
  //
  // CAVEAT: a determined attacker can spoof the Origin header from a scripted
  // (non-browser) client, so this is sybil-resistance against the dominant
  // browser-driven attack vector, not a perfect boundary. Pair this with a
  // CAPTCHA / Turnstile challenge before treating HUMAN role as trustworthy.
  let role: "HUMAN" | "AI" = "AI";
  if (parsed.data.role === "HUMAN") {
    try {
      assertSameOrigin(req);
      role = "HUMAN";
    } catch {
      return NextResponse.json(
        { error: "human_role_requires_same_origin" },
        { status: 403 },
      );
    }
  }

  if (isReservedUsername(username)) {
    return NextResponse.json({ error: "username_reserved" }, { status: 400 });
  }

  // A pubkey OR username banned for prohibited content can never register
  // again - the username carries its bad reputation with it forever.
  if (await isPubkeyBanned(pubkey)) {
    return NextResponse.json({ error: "pubkey_banned" }, { status: 403 });
  }
  if (await isUsernameBanned(username)) {
    return NextResponse.json({ error: "username_banned" }, { status: 403 });
  }

  const expectedTosVersion = process.env.TOS_VERSION;
  if (!expectedTosVersion || tosVersion !== expectedTosVersion) {
    return NextResponse.json(
      { error: "tos_version_mismatch", expected: expectedTosVersion },
      { status: 400 },
    );
  }

  // Check uniqueness
  let existingByUsername = await prisma.user.findUnique({ where: { username } });
  let existingByPubkey = await prisma.user.findUnique({ where: { solanaPubkey: pubkey } });

  // Free up reservations from unverified accounts that never confirmed within
  // the 5-minute window (the purge sweep will also catch these, but do it here
  // so a fresh signup isn't blocked by a lapsed reservation). Delete each
  // stale row at most once and clear *both* references if they point at it.
  const cutoff = new Date(Date.now() - UNVERIFIED_USER_TTL_MS);
  const isStale = (u: typeof existingByUsername) =>
    !!u && !u.txVerified && u.createdAt < cutoff;

  const staleIds = new Set<string>();
  if (isStale(existingByUsername)) staleIds.add(existingByUsername!.id);
  if (isStale(existingByPubkey)) staleIds.add(existingByPubkey!.id);
  if (staleIds.size > 0) {
    await prisma.user.deleteMany({ where: { id: { in: [...staleIds] } } });
    if (existingByUsername && staleIds.has(existingByUsername.id)) existingByUsername = null;
    if (existingByPubkey && staleIds.has(existingByPubkey.id)) existingByPubkey = null;
  }

  // The first account to register with the username "admin" becomes the
  // platform admin (username is unique, so only one can ever hold it). We
  // still guard against granting it if an admin already exists.
  const wantsAdmin = username.toLowerCase() === "admin";
  const grantAdmin =
    wantsAdmin && (await prisma.user.count({ where: { isAdmin: true } })) === 0;

  // If both checks miss, create a fresh user.
  if (!existingByUsername && !existingByPubkey) {
    const user = await prisma.user.create({
      data: {
        username,
        solanaPubkey: pubkey,
        role,
        isAdmin: grantAdmin,
        verifyNonce: makeShortNonce(),
        tosAcceptedAt: new Date(),
        tosVersion,
      },
    });
    if (user.role === "HUMAN") {
      await prisma.humanProfile.create({ data: { userId: user.id, categories: [] } });
    }
    return NextResponse.json({
      step: "verify",
      nonce: user.verifyNonce,
      message: registerMessage(user.verifyNonce!),
      instructions:
        "Sign the returned message with your wallet/key, then POST /api/v1/register/verify with { pubkey, signature }.",
    });
  }

  // If the same pubkey exists but is unverified, allow re-issuing a nonce.
  if (existingByPubkey && !existingByPubkey.txVerified && existingByPubkey.username === username) {
    const updated = await prisma.user.update({
      where: { id: existingByPubkey.id },
      data: {
        verifyNonce: existingByPubkey.verifyNonce ?? makeShortNonce(),
        role,
        isAdmin: existingByPubkey.isAdmin || grantAdmin,
        tosAcceptedAt: new Date(),
        tosVersion,
      },
    });
    return NextResponse.json({
      step: "verify",
      nonce: updated.verifyNonce,
      message: registerMessage(updated.verifyNonce!),
      instructions:
        "Sign the returned message with your wallet/key, then POST /api/v1/register/verify with { pubkey, signature }.",
    });
  }

  return NextResponse.json(
    { error: existingByUsername ? "username_taken" : "pubkey_already_registered" },
    { status: 409 },
  );
}
