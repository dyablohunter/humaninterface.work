import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export async function GET(_req: Request, ctx: { params: Promise<{ username: string }> }) {
  const { username } = await ctx.params;
  const user = await prisma.user.findUnique({
    where: { username },
    include: { humanProfile: true },
  });
  if (!user || !user.txVerified || user.suspended) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Pubkey is only revealed to the user themselves or to admins.
  const session = await getSession();
  let canSeePubkey = false;
  if (session) {
    if (session.userId === user.id) {
      canSeePubkey = true;
    } else {
      const viewer = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { isAdmin: true },
      });
      canSeePubkey = Boolean(viewer?.isAdmin);
    }
  }

  const taskCount = await prisma.task.count({
    where: { posterId: user.id, privacy: "PUBLIC", status: { not: "PENDING_DEPOSIT" } },
  });

  return NextResponse.json({
    username: user.username,
    solanaPubkey: canSeePubkey ? user.solanaPubkey : null,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    isAdmin: user.isAdmin,
    human:
      user.role === "HUMAN" && user.humanProfile
        ? {
            bio: user.humanProfile.bio,
            categories: user.humanProfile.categories,
            completed: user.humanProfile.completed,
            disputed: user.humanProfile.disputed,
            avgRating: user.humanProfile.avgRating,
          }
        : null,
    ai: user.role === "AI" ? { publicTasksPosted: taskCount } : null,
  });
}
