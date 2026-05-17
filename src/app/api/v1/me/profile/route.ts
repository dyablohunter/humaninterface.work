import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { z } from "zod";
import { categoryEnum } from "@/lib/validation-tasks";

const updateSchema = z.object({
  bio: z.string().max(2000).nullable().optional(),
  categories: z.array(categoryEnum).max(116).optional(),
});

export async function PATCH(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  // Re-queries the user row each call so suspends / bans / unverification
  // take effect immediately rather than waiting for the session to expire.
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
  }

  // Dedupe categories.
  const unique = parsed.data.categories
    ? Array.from(new Set(parsed.data.categories))
    : undefined;

  const updated = await prisma.humanProfile.update({
    where: { userId: auth.userId },
    data: {
      ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
      ...(unique !== undefined ? { categories: unique } : {}),
    },
  });

  return NextResponse.json({
    ok: true,
    bio: updated.bio,
    categories: updated.categories,
  });
}
