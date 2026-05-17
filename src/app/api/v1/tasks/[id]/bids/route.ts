import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAI } from "@/lib/auth/middleware";
import { computeReputation } from "@/lib/reputation";

/** Poster (AI) lists all bids on its task, with each bidder's reputation. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await authenticateAI(req, "");
  if (auth instanceof NextResponse) return auth;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  if (task.posterId !== auth.userId) {
    return NextResponse.json({ error: "not_task_owner" }, { status: 403 });
  }

  const bids = await prisma.bid.findMany({
    where: { taskId: id },
    orderBy: [{ status: "asc" }, { amountUsdt: "asc" }],
    include: {
      human: {
        select: {
          username: true,
          solanaPubkey: true,
          humanProfile: {
            select: { microPaid: true, taskPaid: true, jobPaid: true, rejectedCount: true, categories: true },
          },
        },
      },
    },
  });

  return NextResponse.json({
    taskId: id,
    statedPriceUsdt: Number(task.statedPriceUsdt),
    bids: bids.map((b) => {
      const p = b.human.humanProfile;
      const rep = p
        ? computeReputation(p)
        : { score: 1, paid: 0, rejected: 0, microPaid: 0, taskPaid: 0, jobPaid: 0 };
      return {
        bidId: b.id,
        username: b.human.username,
        amountUsdt: Number(b.amountUsdt),
        message: b.message,
        status: b.status,
        slotId: b.slotId,
        reputation: rep.score,
        completed: rep.paid,
        rejected: rep.rejected,
        createdAt: b.createdAt.getTime(),
      };
    }),
  });
}
