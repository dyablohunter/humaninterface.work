import { prisma } from "@/lib/db";
import { refundExpiredTask } from "@/lib/refunds";
import { UNVERIFIED_USER_TTL_MS } from "@/lib/auth/session";

/**
 * Housekeeping sweep (safe to run on a tight interval):
 *  - PENDING_DEPOSIT tasks/milestones past expiresAt → PURGED / REFUNDED
 *    (no funds ever escrowed).
 *  - OPEN/PAUSED tasks past their AI-set deadlineAt: every undelivered slot
 *    is forfeited and its full escrow refunded to the poster; the task is
 *    closed once nothing is left in flight. See refundExpiredTask().
 */
export async function purgeStale(): Promise<number> {
  const now = new Date();
  const [tasks, milestones] = await Promise.all([
    prisma.task.updateMany({
      where: { status: "PENDING_DEPOSIT", expiresAt: { lt: now } },
      data: { status: "PURGED" },
    }),
    prisma.milestone.updateMany({
      where: { status: "PENDING_DEPOSIT", expiresAt: { lt: now } },
      data: { status: "REFUNDED" },
    }),
  ]);

  // Deadline-expired tasks (any slot state). refundExpiredTask refunds the
  // undelivered slots and closes the task; in-flight slots are left alone.
  const expired = await prisma.task.findMany({
    where: {
      status: { in: ["OPEN", "PAUSED"] },
      deadlineAt: { not: null, lt: now },
    },
    select: { id: true },
  });
  let handled = 0;
  for (const t of expired) {
    try {
      const res = await refundExpiredTask(t.id);
      if (res) handled++;
    } catch (err) {
      console.error("[purgeStale] refundExpiredTask error", t.id, err);
    }
  }

  // Unverified accounts whose 5-minute username reservation lapsed: delete the
  // row so the username frees up. HumanProfile cascades on User delete.
  let purgedUsers = 0;
  try {
    const res = await prisma.user.deleteMany({
      where: {
        txVerified: false,
        createdAt: { lt: new Date(now.getTime() - UNVERIFIED_USER_TTL_MS) },
      },
    });
    purgedUsers = res.count;
  } catch (err) {
    console.error("[purgeStale] unverified-user purge error", err);
  }

  return tasks.count + milestones.count + handled + purgedUsers;
}
