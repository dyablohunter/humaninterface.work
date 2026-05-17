import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { usernameSchema, isReservedUsername } from "@/lib/validation";
import { UNVERIFIED_USER_TTL_MS } from "@/lib/auth/session";

/**
 * Lightweight live-availability check for the human signup form.
 * GET /api/v1/username-available?u=<name>
 *   → { valid: false }                            invalid format/length
 *   → { valid: true, available: false, reserved } reserved name
 *   → { valid: true, available: bool }            well-formed name
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u")?.trim() ?? "";
  const parsed = usernameSchema.safeParse(u);
  if (!parsed.success) {
    return NextResponse.json({ valid: false, available: false });
  }
  if (isReservedUsername(parsed.data)) {
    return NextResponse.json({ valid: true, available: false, reserved: true });
  }
  const existing = await prisma.user.findUnique({
    where: { username: parsed.data },
    select: { id: true, txVerified: true, createdAt: true },
  });
  // A name held only by an unverified account whose 5-minute reservation has
  // lapsed counts as available - it will be purged on the next sweep.
  const reservationActive =
    !!existing &&
    (existing.txVerified ||
      existing.createdAt.getTime() > Date.now() - UNVERIFIED_USER_TTL_MS);
  return NextResponse.json({ valid: true, available: !reservationActive });
}
