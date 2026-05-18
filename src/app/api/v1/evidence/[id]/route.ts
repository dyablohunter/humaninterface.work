import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { acquireServeSlot } from "@/lib/serve-queue";

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

  // Stat first so we know the file size before admission. If the file is
  // missing on disk (orphaned DB row), surface a 404.
  let size: number;
  try {
    const st = await stat(path);
    if (!st.isFile()) {
      return NextResponse.json({ error: "variant_unavailable" }, { status: 404 });
    }
    size = st.size;
  } catch {
    return NextResponse.json({ error: "variant_unavailable" }, { status: 404 });
  }

  // Memory + concurrency gate. Refuse cheaply if the host is already loaded.
  const slot = await acquireServeSlot(size);
  if (!slot.ok) {
    const status = slot.reason === "insufficient_memory" ? 503 : 503;
    const retryAfter = slot.reason === "queue_full" ? "5" : "10";
    return NextResponse.json(
      { error: slot.reason, retryAfterSec: Number(retryAfter) },
      { status, headers: { "Retry-After": retryAfter } },
    );
  }

  // Stream the file rather than reading it into a Buffer. The Node read
  // stream uses ~64 KB chunks regardless of file size — total heap impact is
  // small and constant per request, which is the real fix for the OOM vector.
  // We release the queue slot when the stream closes (success, abort, or
  // error). The signal from the request abort propagates into the stream so
  // an early disconnect frees the slot immediately.
  const nodeStream = createReadStream(path);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    slot.release();
  };
  nodeStream.once("close", release);
  nodeStream.once("error", release);

  // Tie request abort → stream destroy so we don't keep reading after the
  // client disconnects.
  if (req.signal) {
    if (req.signal.aborted) nodeStream.destroy();
    else
      req.signal.addEventListener(
        "abort",
        () => nodeStream.destroy(),
        { once: true },
      );
  }

  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(size),
      "Cache-Control":
        task.privacy === "PRIVATE" ? "private, max-age=60" : "public, max-age=86400",
    },
  });
}
