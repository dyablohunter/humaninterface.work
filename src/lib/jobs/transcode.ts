import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { transcodeImage } from "@/lib/compression/image";
import { transcodeVideo } from "@/lib/compression/video";

const BATCH_SIZE = 5;

export async function transcodePending(): Promise<number> {
  const pending = await prisma.evidence.findMany({
    where: {
      transcodedAt: null,
      transcodeError: null,
      sourcePath: { not: null },
      type: { in: ["IMAGE", "VIDEO"] },
    },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
  });

  let done = 0;
  for (const ev of pending) {
    if (!ev.sourcePath) continue;
    try {
      const outputBase = ev.sourcePath.replace(/\.[^.]+$/, "");
      if (ev.type === "IMAGE") {
        const r = await transcodeImage(ev.sourcePath, outputBase);
        await prisma.evidence.update({
          where: { id: ev.id },
          data: {
            pathPrimary: r.pathPrimary,
            pathFallback: r.pathFallback,
            mimePrimary: r.mimePrimary,
            mimeFallback: r.mimeFallback,
            sizeBytes: r.sizeBytesPrimary,
            width: r.width,
            height: r.height,
            transcodedAt: new Date(),
          },
        });
      } else if (ev.type === "VIDEO") {
        const r = await transcodeVideo(ev.sourcePath, outputBase);
        await prisma.evidence.update({
          where: { id: ev.id },
          data: {
            pathPrimary: r.pathPrimary,
            pathFallback: r.pathFallback,
            mimePrimary: r.mimePrimary,
            mimeFallback: r.mimeFallback,
            sizeBytes: r.sizeBytesPrimary,
            durationSec: r.durationSec,
            width: r.width,
            height: r.height,
            transcodedAt: new Date(),
          },
        });
      }
      // Delete the source to save disk.
      try {
        await unlink(ev.sourcePath);
      } catch {
        // ignore
      }
      done++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[transcode] evidence ${ev.id} failed`, msg);
      await prisma.evidence.update({
        where: { id: ev.id },
        data: { transcodeError: msg.slice(0, 1000) },
      });
    }
  }

  return done;
}

export function evidenceOutputDir(taskId: string, ownerId: string): string {
  const root = process.env.EVIDENCE_DIR || join(process.cwd(), "data", "evidence");
  return join(root, taskId, ownerId);
}
