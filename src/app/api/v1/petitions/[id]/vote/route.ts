import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { isEligibleVoter, maybeQualify } from "@/lib/petitions";

/**
 * Toggle the current human's support vote on a petition. One vote per human;
 * calling again removes it. Only "active contributors" (≥1 completed task and
 * seen within 30 days) may vote - their support is what counts toward the 51%
 * threshold that submits a petition to the admin. Returns the fresh tally and
 * qualification progress.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  const petition = await prisma.petition.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!petition) return NextResponse.json({ error: "petition_not_found" }, { status: 404 });
  if (petition.status !== "OPEN") {
    return NextResponse.json({ error: "petition_not_open", status: petition.status }, { status: 409 });
  }

  if (!(await isEligibleVoter(auth.userId))) {
    return NextResponse.json(
      {
        error: "not_eligible_to_vote",
        message:
          "Only humans who have completed at least one task and have been active in the last 30 days can vote on petitions.",
      },
      { status: 403 },
    );
  }

  const existing = await prisma.petitionVote.findUnique({
    where: { petitionId_userId: { petitionId: id, userId: auth.userId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.petitionVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.petitionVote.create({
      data: { petitionId: id, userId: auth.userId },
    });
  }

  const [votes, progress] = await Promise.all([
    prisma.petitionVote.count({ where: { petitionId: id } }),
    maybeQualify(id),
  ]);

  return NextResponse.json({
    ok: true,
    votes,
    voted: !existing,
    status: progress.status,
    supporters: progress.supporters,
    electorate: progress.electorate,
    needed: progress.needed,
  });
}
