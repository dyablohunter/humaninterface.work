import { prisma } from "@/lib/db";
import { NextResponse, type NextRequest } from "next/server";

export interface RateLimitWindow {
  /** Idempotency-ish key, e.g. "contact:ip:1.2.3.4". */
  key: string;
  /** Window in milliseconds (e.g. 60 * 60_000 for an hour). */
  windowMs: number;
  /** Max hits allowed within the window. */
  max: number;
}

/**
 * Returns `null` if every window has room. If any window is exhausted,
 * returns the offending window so the caller can 429 with a useful body.
 *
 * Read-only: does NOT record the hit. Call `recordRateLimitHit` after the
 * operation succeeds (so failures don't burn the budget).
 */
export async function checkRateLimits(
  windows: RateLimitWindow[],
): Promise<RateLimitWindow | null> {
  for (const w of windows) {
    const since = new Date(Date.now() - w.windowMs);
    const n = await prisma.rateLimitHit.count({
      where: { key: w.key, createdAt: { gte: since } },
    });
    if (n >= w.max) return w;
  }
  return null;
}

export async function recordRateLimitHit(keys: string[]) {
  if (keys.length === 0) return;
  await prisma.rateLimitHit.createMany({
    data: keys.map((key) => ({ key })),
  });
}

/**
 * Best-effort caller IP. The `X-Forwarded-For` header is client-controlled
 * unless we know how many trusted reverse proxies sit between us and the
 * internet. `TRUSTED_PROXY_HOPS` (default 0) tells us that count; we then
 * take the XFF entry at position `(length - hops)` from the right — that is
 * the IP the closest trusted proxy actually observed, not whatever the
 * attacker prepended.
 *
 * Deployment notes:
 *  - Single nginx / Cloudflare / load balancer in front of the app → set
 *    `TRUSTED_PROXY_HOPS=1`.
 *  - Two-layer setup (e.g. CF → nginx → app) → `TRUSTED_PROXY_HOPS=2`.
 *  - Local dev or no proxy → leave unset (0); we return `ip:unknown`, which
 *    funnels rate-limit budgets into a single global bucket. Don't deploy
 *    that way to production.
 *
 * The legacy "trust the leftmost XFF entry" behaviour is gone: it let a
 * caller bypass IP rate limits by sending `X-Forwarded-For: <random>` on each
 * request, since the leftmost entry is whatever the client typed.
 */
export function ipFromRequest(req: NextRequest): string {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (!Number.isFinite(hops) || hops <= 0) {
    return "ip:unknown";
  }
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) {
    // `x-real-ip` is set by some single-proxy setups (nginx default). Trust
    // it only when the operator opted into proxy trust.
    const realIp = req.headers.get("x-real-ip");
    return realIp ? realIp.trim() : "ip:unknown";
  }
  const parts = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return "ip:unknown";
  // Indexing from the right: hops=1 → last entry, hops=2 → second-to-last, ...
  const idx = parts.length - hops;
  if (idx < 0) {
    // Caller sent fewer hops than expected. The chain is shorter than the
    // operator declared, so the leftmost (= caller-typed) entry would be
    // attacker-controlled. Refuse and bucket as unknown.
    return "ip:unknown";
  }
  return parts[idx] ?? "ip:unknown";
}

/**
 * Per-user write budgets. Keyed by `(userId, op)`. Designed to be cheap to
 * call inline at the top of an authenticated POST/PATCH/DELETE handler — uses
 * the same `rateLimitHit` table as `checkRateLimits`, so it shares the row
 * format and the housekeeping sweep that prunes expired entries.
 *
 * Returns a 429 NextResponse if any window is exhausted, else `null`. The hit
 * is recorded immediately (not deferred) because we want a denied-but-noisy
 * caller to still burn their budget — otherwise a script that intentionally
 * fails validation can poll forever for free.
 *
 * Suggested presets (callers pass these explicitly so each route is auditable):
 *   USER_LIMITS.message   - 30 / minute, 600 / hour
 *   USER_LIMITS.bid       - 30 / minute, 300 / hour
 *   USER_LIMITS.dispute   -  5 / hour,    20 / day
 *   USER_LIMITS.submit    - 10 / hour,    40 / day
 *   USER_LIMITS.evidence  - 30 / hour,   200 / day
 *   USER_LIMITS.petition  -  5 / day
 *   USER_LIMITS.vote      - 60 / hour,   300 / day
 *   USER_LIMITS.suggest   - 10 / day
 */
export const USER_LIMITS = {
  message:   [{ windowMs:        60_000, max:   30 }, { windowMs:    3_600_000, max:  600 }],
  bid:       [{ windowMs:        60_000, max:   30 }, { windowMs:    3_600_000, max:  300 }],
  dispute:   [{ windowMs:     3_600_000, max:    5 }, { windowMs:   86_400_000, max:   20 }],
  submit:    [{ windowMs:     3_600_000, max:   10 }, { windowMs:   86_400_000, max:   40 }],
  evidence:  [{ windowMs:     3_600_000, max:   30 }, { windowMs:   86_400_000, max:  200 }],
  petition:  [{ windowMs:    86_400_000, max:    5 }],
  vote:      [{ windowMs:     3_600_000, max:   60 }, { windowMs:   86_400_000, max:  300 }],
  suggest:   [{ windowMs:    86_400_000, max:   10 }],
} as const satisfies Record<string, { windowMs: number; max: number }[]>;

export async function enforceUserRateLimit(
  userId: string,
  op: keyof typeof USER_LIMITS,
): Promise<NextResponse | null> {
  const key = `user:${userId}:${op}`;
  const windows: RateLimitWindow[] = USER_LIMITS[op].map((w) => ({ key, ...w }));
  const exhausted = await checkRateLimits(windows);
  // Always burn the budget, even on the request that pushed the caller over,
  // so a denied caller can't poll indefinitely cost-free.
  await recordRateLimitHit([key]);
  if (exhausted) {
    const retryAfterSec = Math.ceil(exhausted.windowMs / 1000);
    return NextResponse.json(
      { error: "rate_limited", op, retryAfterSec },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  return null;
}
