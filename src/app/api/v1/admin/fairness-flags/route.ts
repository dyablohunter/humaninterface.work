import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const tasks = await prisma.task.findMany({
    where: { status: "FAIRNESS_FLAGGED" },
    include: {
      poster: { select: { username: true, solanaPubkey: true } },
      reports: {
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      category: t.category,
      urgency: t.urgency,
      privacy: t.privacy,
      status: t.status,
      fairnessFlags: t.fairnessFlags,
      statedPriceUsdt: Number(t.statedPriceUsdt),
      poster: t.poster,
      reports: t.reports.map((r) => ({
        id: r.id,
        username: r.user.username,
        reason: r.reason,
        createdAt: r.createdAt.getTime(),
      })),
      createdAt: t.createdAt.getTime(),
    })),
  });
}
