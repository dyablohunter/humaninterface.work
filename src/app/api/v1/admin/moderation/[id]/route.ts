import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { banAndBlockAi } from "@/lib/ban";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["ban", "clear"]),
});

/**
 * Admin disposition of a queued ModerationReview (classifier was unavailable
 * when the content was posted, so it was allowed through). The admin either
 * confirms the ban - permanently blocklisting the pubkey + username, keeping
 * posts & funds - or clears it as a false alarm.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  const review = await prisma.moderationReview.findUnique({ where: { id } });
  if (!review) return NextResponse.json({ error: "review_not_found" }, { status: 404 });

  if (parsed.data.action === "clear") {
    await prisma.moderationReview.update({
      where: { id },
      data: { status: "CLEARED", category: "none" },
    });
    await prisma.auditLog.create({
      data: {
        userId: admin.userId,
        action: "MODERATION_REVIEW_CLEARED",
        payload: { reviewId: id, username: review.username, pubkey: review.pubkey },
      },
    });
    return NextResponse.json({ ok: true, status: "CLEARED" });
  }

  // action === "ban"
  if (review.userId) {
    try {
      await banAndBlockAi(review.userId, {
        reason: "prohibited_content",
        category: review.category || "admin_confirmed",
        detail: review.detail || "Admin-confirmed from moderation queue",
      });
    } catch (err) {
      console.error("[admin/moderation] ban failed", err);
      return NextResponse.json({ error: "ban_failed" }, { status: 500 });
    }
  }
  await prisma.moderationReview.update({
    where: { id },
    data: { status: "ACTIONED" },
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.userId,
      action: "MODERATION_REVIEW_ACTIONED",
      payload: { reviewId: id, username: review.username, pubkey: review.pubkey },
    },
  });
  return NextResponse.json({ ok: true, status: "ACTIONED" });
}
