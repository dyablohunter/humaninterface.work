import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";

/**
 * Admin hard-delete for a Task. Cascades through Prisma's relation rules to
 * Slot, Bid, Application, Milestone, Report, Message. TokenTxLog and AuditLog
 * are deliberately kept (no FK relation; they're audit history that should
 * outlive the row).
 *
 * Intentionally destructive - there is no soft-delete equivalent on Task.
 * Admin only.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const before = await prisma.task.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, posterId: true },
    });
    if (!before) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: before });
  } catch (err) {
    return NextResponse.json(
      { error: "delete_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
