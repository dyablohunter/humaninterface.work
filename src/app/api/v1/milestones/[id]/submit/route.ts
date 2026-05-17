import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { submitTextSchema } from "@/lib/validation-tasks";
import { enforceHumanContentPolicy } from "@/lib/moderation";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  let body: unknown = {};
  try { body = await req.json(); } catch {}
  const parsed = submitTextSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { slot: true, evidence: true },
  });
  if (!milestone) return NextResponse.json({ error: "milestone_not_found" }, { status: 404 });
  if (milestone.slot.humanId !== auth.userId) {
    return NextResponse.json({ error: "not_slot_owner" }, { status: 403 });
  }
  if (milestone.status !== "CLAIMED") {
    return NextResponse.json({ error: "milestone_not_claimed", status: milestone.status }, { status: 409 });
  }
  if (!parsed.data.text && milestone.evidence.length === 0) {
    return NextResponse.json({ error: "no_evidence_attached" }, { status: 400 });
  }

  if (parsed.data.text) {
    const blocked = await enforceHumanContentPolicy(auth.userId, parsed.data.text, {
      kind: "EVIDENCE_TEXT",
      targetId: milestone.id,
    });
    if (blocked) return blocked;
  }

  await prisma.$transaction(async (tx) => {
    if (parsed.data.text) {
      await tx.evidence.create({
        data: { milestoneId: milestone.id, type: "TEXT", bodyText: parsed.data.text },
      });
    }
    await tx.milestone.update({
      where: { id: milestone.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true, status: "SUBMITTED" });
}
