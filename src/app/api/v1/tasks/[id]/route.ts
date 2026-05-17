import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

/**
 * Machine-readable task detail. Mirrors what the /open-work/[id] page renders.
 * Public tasks: open to anyone. Private tasks: poster, invited human, or
 * any human who claimed a slot may read.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      poster: { select: { username: true, solanaPubkey: true } },
      slots: {
        include: {
          human: { select: { username: true, solanaPubkey: true } },
          evidence: true,
          dispute: true,
          milestones: { orderBy: { sequenceNum: "asc" } },
        },
        orderBy: { id: "asc" },
      },
      bids: {
        include: {
          human: {
            select: {
              username: true,
              humanProfile: {
                select: { microPaid: true, taskPaid: true, jobPaid: true, rejectedCount: true },
              },
            },
          },
        },
        orderBy: [{ status: "asc" }, { amountUsdt: "asc" }],
      },
      _count: { select: { reports: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });

  const session = await getSession();
  const viewerId = session?.userId ?? null;
  let viewerIsAdmin = false;
  if (viewerId) {
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { isAdmin: true },
    });
    viewerIsAdmin = Boolean(viewer?.isAdmin);
  }

  const acceptedBidderIds = new Set(
    task.bids.filter((b) => b.status === "ACCEPTED").map((b) => b.humanId),
  );

  if (task.privacy === "PRIVATE") {
    const allowed =
      viewerIsAdmin ||
      viewerId === task.posterId ||
      task.invitedHumanId === viewerId ||
      task.slots.some((s) => s.humanId === viewerId);
    if (!allowed) return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  }

  // Pubkeys are only revealed to participants (poster, slot claimer, accepted
  // bidder, invited human) and admins. Unrelated viewers (incl. unauthenticated)
  // see usernames only.
  const canSeePubkeys =
    viewerIsAdmin ||
    (viewerId !== null &&
      (viewerId === task.posterId ||
        task.invitedHumanId === viewerId ||
        task.slots.some((s) => s.humanId === viewerId) ||
        acceptedBidderIds.has(viewerId)));

  return NextResponse.json({
    id: task.id,
    type: task.type,
    title: task.title,
    description: task.description,
    category: task.category,
    urgency: task.urgency,
    privacy: task.privacy,
    status: task.status,
    slotCount: task.slotCount,
    estimatedMinutes: task.estimatedMinutes,
    statedPriceUsdt: Number(task.statedPriceUsdt),
    minReputation: task.minReputation,
    deadlineAt: task.deadlineAt?.getTime() ?? null,
    totalUsdt: Number(task.totalUsdt),
    escrowTxSig: task.escrowTxSig,
    fairnessFlags: task.fairnessFlags,
    invitedHumanId: task.invitedHumanId,
    country: task.country,
    city: task.city,
    latitude: task.latitude,
    longitude: task.longitude,
    createdAt: task.createdAt.getTime(),
    fundedAt: task.fundedAt?.getTime() ?? null,
    expiresAt: task.expiresAt.getTime(),
    biddingHours: task.biddingHours,
    biddingClosesAt: task.biddingClosesAt?.getTime() ?? null,
    poster: {
      username: task.poster.username,
      solanaPubkey: canSeePubkeys ? task.poster.solanaPubkey : null,
    },
    slots: task.slots.map((s) => ({
      id: s.id,
      status: s.status,
      awardedUsdt: s.awardedUsdt === null ? null : Number(s.awardedUsdt),
      claimedAt: s.claimedAt?.getTime() ?? null,
      submittedAt: s.submittedAt?.getTime() ?? null,
      decidedAt: s.decidedAt?.getTime() ?? null,
      rejectionReason: s.rejectionReason,
      paidTxSig: s.paidTxSig,
      human: s.human
        ? {
            username: s.human.username,
            // Slot holder pubkey visible to participants and admins; viewers
            // who hold this slot themselves always see their own pubkey via
            // the admin/participant gate.
            solanaPubkey: canSeePubkeys || s.humanId === viewerId ? s.human.solanaPubkey : null,
          }
        : null,
      evidence: s.evidence.map((e) => ({
        id: e.id,
        type: e.type,
        bodyText: e.bodyText,
        mimePrimary: e.mimePrimary,
        mimeFallback: e.mimeFallback,
        sizeBytes: e.sizeBytes,
        durationSec: e.durationSec,
        width: e.width,
        height: e.height,
        transcodedAt: e.transcodedAt?.getTime() ?? null,
        transcodeError: e.transcodeError,
        createdAt: e.createdAt.getTime(),
      })),
      milestones: s.milestones.map((m) => ({
        id: m.id,
        sequenceNum: m.sequenceNum,
        hoursForDay: m.hoursForDay,
        status: m.status,
        perMilestoneUsdt: m.perMilestoneUsdt === null ? null : Number(m.perMilestoneUsdt),
        usdtAmount: m.usdtAmount === null ? null : Number(m.usdtAmount),
        escrowTxSig: m.escrowTxSig,
        expiresAt: m.expiresAt?.getTime() ?? null,
        submittedAt: m.submittedAt?.getTime() ?? null,
        approvedAt: m.approvedAt?.getTime() ?? null,
        paidTxSig: m.paidTxSig,
        rejectionReason: m.rejectionReason,
      })),
      dispute: s.dispute
        ? { id: s.dispute.id, status: s.dispute.status, createdAt: s.dispute.createdAt.getTime() }
        : null,
    })),
    bids: task.bids.map((b) => {
      const p = b.human.humanProfile;
      const paid = p ? p.microPaid + p.taskPaid + p.jobPaid : 0;
      const denom = p ? paid + p.rejectedCount : 0;
      return {
        id: b.id,
        humanUsername: b.human.username,
        amountUsdt: Number(b.amountUsdt),
        message: b.message,
        status: b.status,
        reputation: denom === 0 ? null : Math.round((paid / denom) * 1000) / 1000,
        completed: paid,
        createdAt: b.createdAt.getTime(),
      };
    }),
    reportCount: task._count.reports,
  });
}
