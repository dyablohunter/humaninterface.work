import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { contactSchema } from "@/lib/validation";
import { checkRateLimits, ipFromRequest, recordRateLimitHit } from "@/lib/rate-limit";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Public contact form - open to anyone (no auth required). Messages land in
 * the admin inbox alongside suggestions. If the sender happens to be logged
 * in we attach their userId for context.
 *
 * Rate-limited by IP (5/hr, 20/day) and by email (3/day). The admin UI must
 * HTML-escape `name`/`email`/`body` on render - storage stays raw.
 */
export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const ip = ipFromRequest(req);
  const emailKey = `contact:email:${parsed.data.email.trim().toLowerCase()}`;
  const ipKey = `contact:ip:${ip}`;

  const exceeded = await checkRateLimits([
    { key: ipKey, windowMs: HOUR_MS, max: 5 },
    { key: ipKey, windowMs: DAY_MS, max: 20 },
    { key: emailKey, windowMs: DAY_MS, max: 3 },
  ]);
  if (exceeded) {
    const retry = Math.ceil(exceeded.windowMs / 1000);
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec: retry },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  const session = await getSession();
  const created = await prisma.contactMessage.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      body: parsed.data.body,
      userId: session?.userId ?? null,
    },
  });

  await recordRateLimitHit([ipKey, emailKey]);

  return NextResponse.json({ ok: true, id: created.id });
}
