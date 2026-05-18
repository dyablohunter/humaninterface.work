import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;

/**
 * Pagination: cursor-based on `createdAt` ascending (the same order the admin
 * UI consumes). `?cursor=<dispute.id>` returns rows strictly after that row,
 * `?take=<n>` (1..100, default 50) caps page size, and the response includes
 * `nextCursor` (or null when the page is the last). Total count is returned
 * once so the UI can show "{loaded} of {total}".
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const sp = new URL(req.url).searchParams;
  const cursor = sp.get("cursor") || null;
  const takeRaw = Number(sp.get("take") ?? DEFAULT_TAKE);
  const take = Number.isFinite(takeRaw)
    ? Math.min(MAX_TAKE, Math.max(1, Math.trunc(takeRaw)))
    : DEFAULT_TAKE;

  const total = await prisma.dispute.count({ where: { status: "OPEN" } });

  const page = await prisma.dispute.findMany({
    where: { status: "OPEN" },
    take: take + 1, // +1 to detect "has more"
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const hasMore = page.length > take;
  const disputes = hasMore ? page.slice(0, take) : page;
  const nextCursor = hasMore ? disputes[disputes.length - 1]?.id ?? null : null;

  return NextResponse.json({
    total,
    nextCursor,
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
