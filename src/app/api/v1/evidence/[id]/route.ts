import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const fallback = url.searchParams.get("fallback") === "true";

  const ev = await prisma.evidence.findUnique({
    where: { id },
    include: {
      slot: { include: { task: true } },
      milestone: { include: { task: true } },
    },
  });
  if (!ev) return NextResponse.json({ error: "evidence_not_found" }, { status: 404 });

  const task = ev.slot?.task ?? ev.milestone?.task;
  if (!task) return NextResponse.json({ error: "orphan_evidence" }, { status: 500 });

  // Authorization: public tasks are open; private requires participant or admin.
  if (task.privacy === "PRIVATE") {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    const allowed =
      !!user &&
      (user.isAdmin ||
        task.posterId === user.id ||
        ev.slot?.humanId === user.id ||
        task.invitedHumanId === user.id);
    if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!ev.transcodedAt) {
    return NextResponse.json(
      { error: "still_transcoding", retryAfterSec: 5 },
      { status: 425, headers: { "Retry-After": "5" } },
    );
  }

  const path = fallback ? ev.pathFallback : ev.pathPrimary;
  const mime = fallback ? ev.mimeFallback : ev.mimePrimary;
  if (!path || !mime) {
    return NextResponse.json({ error: "variant_unavailable" }, { status: 404 });
  }

  const buf = await readFile(path);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buf.length),
      "Cache-Control": task.privacy === "PRIVATE" ? "private, max-age=60" : "public, max-age=86400",
    },
  });
}
