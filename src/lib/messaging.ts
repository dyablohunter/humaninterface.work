import { prisma } from "@/lib/db";

/**
 * Messaging is scoped to one thread per (task, human) pair. The AI side of
 * every thread is implicitly the task's poster. A human may only message on a
 * task they participate in (hold a Bid - any status - or a Slot on it).
 */

/** True if `humanId` holds a bid or slot on `taskId`. */
export async function isParticipant(taskId: string, humanId: string): Promise<boolean> {
  const [bid, slot] = await Promise.all([
    prisma.bid.findFirst({ where: { taskId, humanId }, select: { id: true } }),
    prisma.slot.findFirst({ where: { taskId, humanId }, select: { id: true } }),
  ]);
  return Boolean(bid || slot);
}

export type CanMessage =
  | { ok: true; humanId: string }
  | { ok: false; error: string; status: number };

/**
 * Resolves and authorizes the (task, human) thread for a sender.
 *
 * - HUMAN sender: the thread is their own; they must be a participant.
 * - AI sender: must be the task poster; `humanUsername` selects the thread and
 *   that human must be a participant.
 */
export async function assertCanMessage(
  taskId: string,
  userId: string,
  role: "HUMAN" | "AI",
  humanUsername?: string,
): Promise<CanMessage> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, posterId: true },
  });
  if (!task) return { ok: false, error: "task_not_found", status: 404 };

  if (role === "HUMAN") {
    if (!(await isParticipant(taskId, userId))) {
      return { ok: false, error: "not_a_participant", status: 403 };
    }
    return { ok: true, humanId: userId };
  }

  // AI sender
  if (task.posterId !== userId) {
    return { ok: false, error: "not_task_poster", status: 403 };
  }
  if (!humanUsername) {
    return { ok: false, error: "human_username_required", status: 400 };
  }
  const human = await prisma.user.findUnique({
    where: { username: humanUsername },
    select: { id: true },
  });
  if (!human) return { ok: false, error: "human_not_found", status: 404 };
  if (!(await isParticipant(taskId, human.id))) {
    return { ok: false, error: "not_a_participant", status: 403 };
  }
  return { ok: true, humanId: human.id };
}

export interface ThreadSummary {
  humanUsername: string;
  lastAt: string | null;
  unread: number; // messages from the human the AI has not read
}

/** All counterpart-human threads for a task's AI poster, with unread counts. */
export async function threadList(taskId: string): Promise<ThreadSummary[]> {
  const [bidders, claimers] = await Promise.all([
    prisma.bid.findMany({
      where: { taskId },
      select: { human: { select: { id: true, username: true } } },
    }),
    prisma.slot.findMany({
      where: { taskId, humanId: { not: null } },
      select: { human: { select: { id: true, username: true } } },
    }),
  ]);

  const humans = new Map<string, string>(); // id -> username
  for (const b of bidders) humans.set(b.human.id, b.human.username);
  for (const s of claimers) if (s.human) humans.set(s.human.id, s.human.username);

  const summaries = await Promise.all(
    [...humans.entries()].map(async ([humanId, username]) => {
      const [last, unread] = await Promise.all([
        prisma.message.findFirst({
          where: { taskId, humanId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.message.count({
          where: { taskId, humanId, senderRole: "HUMAN", readByAi: false },
        }),
      ]);
      return {
        humanUsername: username,
        lastAt: last ? last.createdAt.toISOString() : null,
        unread,
      };
    }),
  );

  // Most recently active threads first; never-messaged threads last.
  return summaries.sort((a, b) => {
    if (a.lastAt && b.lastAt) return b.lastAt.localeCompare(a.lastAt);
    if (a.lastAt) return -1;
    if (b.lastAt) return 1;
    return a.humanUsername.localeCompare(b.humanUsername);
  });
}
