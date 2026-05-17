import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { z } from "zod";

const bodySchema = z.object({
  suspended: z.boolean(),
  reason: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ username: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const { username } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  if (target.isAdmin) {
    return NextResponse.json({ error: "cannot_suspend_admin" }, { status: 403 });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { suspended: parsed.data.suspended },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      action: parsed.data.suspended ? "USER_SUSPEND" : "USER_UNSUSPEND",
      payload: { username, reason: parsed.data.reason ?? null },
    },
  });
  return NextResponse.json({ ok: true, username: updated.username, suspended: updated.suspended });
}
