import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAny } from "@/lib/auth/middleware";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { suggestionSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const auth = await authenticateAny(req, rawBody);
  if (auth instanceof NextResponse) return auth;

  const rl = await enforceUserRateLimit(auth.userId, "suggest");
  if (rl) return rl;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = suggestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const created = await prisma.suggestion.create({
    data: { userId: auth.userId, body: parsed.data.body },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
