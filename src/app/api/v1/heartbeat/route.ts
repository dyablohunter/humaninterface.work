import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { checkSameOrigin } from "@/lib/auth/csrf";

/**
 * Heartbeat ping. Updates `lastSeenAt` for authenticated humans (used as the
 * denominator for the 10% fairness-flag threshold). Returns 204 No Content for
 * unauthenticated callers so the global client-side Heartbeat doesn't generate
 * noisy 401s for anonymous visitors.
 */
export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const session = await getSession();
  if (!session) {
    return new NextResponse(null, { status: 204 });
  }
  await prisma.user.update({
    where: { id: session.userId },
    data: { lastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
