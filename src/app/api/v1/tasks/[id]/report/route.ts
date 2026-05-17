import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { reportSchema } from "@/lib/validation-tasks";

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const FAIRNESS_FLAG_RATIO = 0.1;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });

  // Public tasks: any active human can report. Private tasks: only the invited human.
  if (task.privacy === "PRIVATE") {
    if (task.invitedHumanId !== auth.userId) {
      return NextResponse.json({ error: "private_task_only_invited_can_report" }, { status: 403 });
    }
  }

  // Idempotent: unique on (taskId, userId) so a second POST returns 409.
  try {
    await prisma.report.create({
      data: {
        taskId: task.id,
        userId: auth.userId,
        reason: parsed.data.reason ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "already_reported" }, { status: 409 });
    }
    throw err;
  }

  // For public tasks, evaluate the 10%-of-active threshold.
  if (task.privacy === "PUBLIC") {
    const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);
    const [activeCount, reportCount] = await Promise.all([
      prisma.user.count({
        where: { role: "HUMAN", txVerified: true, suspended: false, lastSeenAt: { gte: cutoff } },
      }),
      prisma.report.count({ where: { taskId: task.id } }),
    ]);
    // Use ceil so the threshold is meaningful even at small denominators.
    const threshold = Math.max(1, Math.ceil(activeCount * FAIRNESS_FLAG_RATIO));

    if (reportCount >= threshold && task.status === "OPEN") {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: "FAIRNESS_FLAGGED", fairnessFlags: reportCount },
      });
      return NextResponse.json({
        ok: true,
        flagged: true,
        reports: reportCount,
        activeHumans: activeCount,
        threshold,
      });
    }
    await prisma.task.update({
      where: { id: task.id },
      data: { fairnessFlags: reportCount },
    });
    return NextResponse.json({
      ok: true,
      flagged: false,
      reports: reportCount,
      activeHumans: activeCount,
      threshold,
    });
  }

  return NextResponse.json({ ok: true, flagged: false });
}
