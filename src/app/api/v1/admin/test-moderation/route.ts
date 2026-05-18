import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { assertDevOnly } from "@/lib/dev-only";
import { banAndBlockAi } from "@/lib/ban";

const Kind = z.enum([
  "TASK_POST",
  "DECISION_NOTE",
  "HUMAN_MESSAGE",
  "EVIDENCE_TEXT",
  "EVIDENCE_MEDIA",
  "PETITION",
]);
const Status = z.enum(["PENDING", "CLEARED", "ACTIONED", "MANUAL"]);

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create-review"),
    username: z.string().min(3),
    kind: Kind,
    content: z.string().min(1).max(20_000),
    status: Status.default("MANUAL"),
    targetId: z.string().optional(),
    category: z.string().optional(),
  }),
  z.object({
    action: z.literal("set-review-status"),
    id: z.string().min(1),
    status: Status,
  }),
  z.object({
    action: z.literal("ban-user"),
    username: z.string().min(3),
    category: z.string().default("test"),
    detail: z.string().default("admin-test injection"),
  }),
]);

/**
 * Admin levers to exercise the content-safety branches deterministically,
 * without needing DeepSeek to cooperate (or fail). Creates ModerationReview
 * rows in any state, force-bans + blocklists an account, or moves an
 * existing review row to a chosen status.
 */
export async function POST(req: NextRequest) {
  const denied = assertDevOnly();
  if (denied) return denied;
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "create-review") {
      const u = await prisma.user.findUnique({ where: { username: parsed.data.username } });
      if (!u) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      const row = await prisma.moderationReview.create({
        data: {
          userId: u.id,
          pubkey: u.solanaPubkey,
          username: u.username,
          kind: parsed.data.kind,
          content: parsed.data.content,
          status: parsed.data.status,
          targetId: parsed.data.targetId ?? null,
          category: parsed.data.category ?? null,
          detail: "admin-test injection",
        },
      });
      return NextResponse.json({ ok: true, review: row });
    }

    if (parsed.data.action === "set-review-status") {
      const row = await prisma.moderationReview.update({
        where: { id: parsed.data.id },
        data: { status: parsed.data.status },
      });
      return NextResponse.json({ ok: true, review: row });
    }

    if (parsed.data.action === "ban-user") {
      const u = await prisma.user.findUnique({ where: { username: parsed.data.username } });
      if (!u) return NextResponse.json({ error: "user_not_found" }, { status: 404 });
      const result = await banAndBlockAi(u.id, {
        reason: "prohibited_content",
        category: parsed.data.category,
        detail: parsed.data.detail,
      });
      return NextResponse.json({ ok: true, banned: result });
    }

    return NextResponse.json({ error: "unhandled_action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "moderation_action_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
