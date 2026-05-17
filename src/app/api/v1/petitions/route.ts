import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { petitionSchema } from "@/lib/validation";
import { enforceHumanContentPolicy } from "@/lib/moderation";

/**
 * Create a petition - a human-raised proposal to change the platform,
 * protocol, etc. Other humans vote in support; the admin dashboard surfaces
 * them by vote count. Humans only (the admin is not a participant).
 */
export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = petitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const blocked = await enforceHumanContentPolicy(
    auth.userId,
    `${parsed.data.title}\n\n${parsed.data.body}`,
    { kind: "PETITION" },
  );
  if (blocked) return blocked;

  const created = await prisma.petition.create({
    data: {
      authorId: auth.userId,
      title: parsed.data.title,
      body: parsed.data.body,
    },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
