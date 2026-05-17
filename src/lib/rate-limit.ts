import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

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
 * Best-effort caller IP. Trusts the FIRST entry of `x-forwarded-for`, then
 * `x-real-ip`. Falls back to a sentinel so we still gate anonymous floods.
 */
export function ipFromRequest(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "ip:unknown";
}
