import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { checkSameOrigin } from "@/lib/auth/csrf";

export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
