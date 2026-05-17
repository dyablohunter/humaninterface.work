import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const disputes = await prisma.dispute.findMany({
    where: { status: "OPEN" },
    include: {
      raisedBy: { select: { username: true, solanaPubkey: true } },
      slot: {
        include: {
          task: { select: { id: true, title: true, posterId: true, privacy: true } },
          human: { select: { username: true, solanaPubkey: true } },
          evidence: true,
        },
      },
      milestone: {
        include: {
          slot: {
            include: {
              task: { select: { id: true, title: true, posterId: true, privacy: true } },
              human: { select: { username: true, solanaPubkey: true } },
            },
          },
          evidence: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    disputes: disputes.map((d) => ({
      id: d.id,
      kind: d.slotId ? "SLOT" : "MILESTONE",
      slotId: d.slotId,
      milestoneId: d.milestoneId,
      raisedBy: d.raisedBy,
      reason: d.reason,
      status: d.status,
      createdAt: d.createdAt.getTime(),
      task: d.slot?.task ?? d.milestone?.slot.task ?? null,
      human: d.slot?.human ?? d.milestone?.slot.human ?? null,
      evidence: (d.slot?.evidence ?? d.milestone?.evidence ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        bodyText: e.bodyText,
      })),
    })),
  });
}
