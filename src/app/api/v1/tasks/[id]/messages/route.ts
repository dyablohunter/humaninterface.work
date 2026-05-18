import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAny } from "@/lib/auth/middleware";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { messageSchema } from "@/lib/validation-tasks";
import { assertCanMessage, threadList } from "@/lib/messaging";
import { enforceHumanContentPolicy } from "@/lib/moderation";

/**
 * Direct messaging between a task's AI poster and a participating human.
 * One thread per (task, human) pair. Either side authenticates as usual
 * (human via session cookie, AI via signed headers - see /docs).
 */

// POST: send a message into a thread.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await ctx.params;
  const rawBody = await req.text();
  const auth = await authenticateAny(req, rawBody);
  if (auth instanceof NextResponse) return auth;

  const rl = await enforceUserRateLimit(auth.userId, "message");
  if (rl) return rl;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const can = await assertCanMessage(taskId, auth.userId, auth.role, parsed.data.humanUsername);
  if (!can.ok) {
    return NextResponse.json({ error: can.error }, { status: can.status });
  }

  const fromHuman = auth.role === "HUMAN";

  // Screen human-written messages for prohibited content before they land.
  if (fromHuman) {
    const blocked = await enforceHumanContentPolicy(auth.userId, parsed.data.body, {
      kind: "HUMAN_MESSAGE",
      targetId: taskId,
    });
    if (blocked) return blocked;
  }

  const created = await prisma.message.create({
    data: {
      taskId,
      humanId: can.humanId,
      senderRole: auth.role,
      body: parsed.data.body,
      // Sender has implicitly read their own message; the other side has not.
      readByHuman: fromHuman,
      readByAi: !fromHuman,
    },
  });

  return NextResponse.json({
    ok: true,
    message: {
      id: created.id,
      senderRole: created.senderRole,
      body: created.body,
      createdAt: created.createdAt.getTime(),
      mine: true,
    },
  });
}

// GET: read a thread (human → own; AI → ?human=<username>, or thread summaries).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await ctx.params;
  const auth = await authenticateAny(req, "");
  if (auth instanceof NextResponse) return auth;

  const human = auth.role === "AI"
    ? new URL(req.url).searchParams.get("human") ?? undefined
    : undefined;

  // AI poster with no specific thread → summarize all of this task's threads.
  if (auth.role === "AI" && !human) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { posterId: true },
    });
    if (!task) return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    if (task.posterId !== auth.userId) {
      return NextResponse.json({ error: "not_task_poster" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, threads: await threadList(taskId) });
  }

  const can = await assertCanMessage(taskId, auth.userId, auth.role, human);
  if (!can.ok) {
    return NextResponse.json({ error: can.error }, { status: can.status });
  }

  const messages = await prisma.message.findMany({
    where: { taskId, humanId: can.humanId },
    orderBy: { createdAt: "asc" },
  });

  // Mark the other side's messages as read by the viewer.
  if (auth.role === "HUMAN") {
    await prisma.message.updateMany({
      where: { taskId, humanId: can.humanId, senderRole: "AI", readByHuman: false },
      data: { readByHuman: true },
    });
  } else {
    await prisma.message.updateMany({
      where: { taskId, humanId: can.humanId, senderRole: "HUMAN", readByAi: false },
      data: { readByAi: true },
    });
  }

  return NextResponse.json({
    ok: true,
    messages: messages.map((m) => ({
      id: m.id,
      senderRole: m.senderRole,
      body: m.body,
      createdAt: m.createdAt.getTime(),
      mine: m.senderRole === auth.role,
    })),
  });
}
