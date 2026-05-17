import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";

/**
 * Records the current human's acceptance of the active TOS_VERSION. The UI
 * surfaces this prompt whenever the user's stored tosVersion differs from
 * process.env.TOS_VERSION (see userMustReacceptTos / /me page banner).
 */
export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  const current = process.env.TOS_VERSION;
  if (!current) {
    return NextResponse.json({ error: "tos_version_not_configured" }, { status: 500 });
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: { tosVersion: current, tosAcceptedAt: new Date() },
  });

  return NextResponse.json({ ok: true, tosVersion: current });
}
