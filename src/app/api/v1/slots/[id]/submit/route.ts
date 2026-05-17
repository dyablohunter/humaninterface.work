import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { submitTextSchema } from "@/lib/validation-tasks";
import { enforceHumanContentPolicy } from "@/lib/moderation";

/**
 * Submit evidence for a claimed slot. The actual file upload happens at
 * /api/v1/slots/[id]/evidence; this endpoint marks the slot as SUBMITTED once
 * the human is done attaching evidence. Text evidence is accepted inline here.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // No body is fine - just transitions state.
  }
  const parsed = submitTextSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const { text } = parsed.data;

  const slot = await prisma.slot.findUnique({
    where: { id },
    include: { task: true, evidence: true },
  });
  if (!slot) return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  if (slot.humanId !== auth.userId) {
    return NextResponse.json({ error: "not_slot_owner" }, { status: 403 });
  }
  if (slot.status !== "CLAIMED") {
    return NextResponse.json({ error: "slot_not_submittable", status: slot.status }, { status: 409 });
  }
  if (slot.task.deadlineAt && slot.task.deadlineAt.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "task_deadline_passed", deadlineAt: slot.task.deadlineAt.getTime() },
      { status: 409 },
    );
  }

  // Require at least some evidence (text or attached files).
  if (!text && slot.evidence.length === 0) {
    return NextResponse.json({ error: "no_evidence_attached" }, { status: 400 });
  }

  // Screen human-written text evidence before it is stored.
  if (text) {
    const blocked = await enforceHumanContentPolicy(auth.userId, text, {
      kind: "EVIDENCE_TEXT",
      targetId: slot.id,
    });
    if (blocked) return blocked;
  }

  await prisma.$transaction(async (tx) => {
    if (text) {
      await tx.evidence.create({
        data: {
          slotId: slot.id,
          type: "TEXT",
          bodyText: text,
        },
      });
    }
    await tx.slot.update({
      where: { id: slot.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true, slotId: slot.id, status: "SUBMITTED" });
}
