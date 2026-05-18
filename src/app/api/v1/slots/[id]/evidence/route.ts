import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { authenticateHuman } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import { evidenceOutputDir } from "@/lib/jobs/transcode";
import { queueEvidenceMediaForReview } from "@/lib/moderation";

const MAX_IMAGES = 10;
const MAX_VIDEOS = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/gif",
]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/mpeg",
  "video/x-msvideo",
]);

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await authenticateHuman();
  if (auth instanceof NextResponse) return auth;

  const rl = await enforceUserRateLimit(auth.userId, "evidence");
  if (rl) return rl;

  const slot = await prisma.slot.findUnique({
    where: { id },
    include: {
      task: true,
      evidence: { where: { type: { in: ["IMAGE", "VIDEO"] } } },
    },
  });
  if (!slot) return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  if (slot.humanId !== auth.userId) {
    return NextResponse.json({ error: "not_slot_owner" }, { status: 403 });
  }
  if (slot.status !== "CLAIMED") {
    return NextResponse.json({ error: "slot_not_claimed" }, { status: 409 });
  }

  const existingImages = slot.evidence.filter((e) => e.type === "IMAGE").length;
  const existingVideos = slot.evidence.filter((e) => e.type === "VIDEO").length;

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "no_files" }, { status: 400 });
  }

  let imagesToAdd = 0;
  let videosToAdd = 0;
  for (const f of files) {
    if (IMAGE_MIMES.has(f.type)) imagesToAdd++;
    else if (VIDEO_MIMES.has(f.type)) videosToAdd++;
    else return NextResponse.json({ error: "unsupported_mime", mime: f.type }, { status: 400 });
  }

  if (existingImages + imagesToAdd > MAX_IMAGES) {
    return NextResponse.json({ error: "image_limit_exceeded", max: MAX_IMAGES }, { status: 400 });
  }
  if (existingVideos + videosToAdd > MAX_VIDEOS) {
    return NextResponse.json({ error: "video_limit_exceeded", max: MAX_VIDEOS }, { status: 400 });
  }

  for (const f of files) {
    if (IMAGE_MIMES.has(f.type) && f.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "image_too_large", maxBytes: MAX_IMAGE_BYTES, file: f.name },
        { status: 400 },
      );
    }
    if (VIDEO_MIMES.has(f.type) && f.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: "video_too_large", maxBytes: MAX_VIDEO_BYTES, file: f.name },
        { status: 400 },
      );
    }
  }

  const dir = evidenceOutputDir(slot.task.id, slot.id);
  await mkdir(dir, { recursive: true });

  const created: string[] = [];
  for (const f of files) {
    const isImage = IMAGE_MIMES.has(f.type);
    // Sanitize the extension: only [a-z0-9], max 8 chars. The full path is
    // later passed to ffmpeg as an input - never let user data flow into it.
    const rawExt = (f.name.split(".").pop() || (isImage ? "img" : "vid")).toLowerCase();
    const ext = rawExt.replace(/[^a-z0-9]/g, "").slice(0, 8) || (isImage ? "img" : "vid");
    const stem = randomBytes(8).toString("hex");
    const sourcePath = join(dir, `${stem}.src.${ext}`);
    const bytes = Buffer.from(await f.arrayBuffer());
    await writeFile(sourcePath, bytes);

    const ev = await prisma.evidence.create({
      data: {
        slotId: slot.id,
        type: isImage ? "IMAGE" : "VIDEO",
        sourcePath,
        sizeBytes: bytes.length,
      },
    });
    created.push(ev.id);

    // The classifier is text-only - flag uploaded media for an admin to view.
    await queueEvidenceMediaForReview(
      auth.userId,
      ev.id,
      `${isImage ? "IMAGE" : "VIDEO"} evidence on slot ${slot.id} (task ${slot.task.id}, "${slot.task.title}") - file "${f.name}". Classifier cannot inspect media; manual review required.`,
    );
  }

  return NextResponse.json({ ok: true, uploaded: created.length, evidenceIds: created });
}
