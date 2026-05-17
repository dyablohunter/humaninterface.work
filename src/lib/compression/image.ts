import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const AVIF_QUALITY = 50;
const WEBP_QUALITY = 70;
const MAX_DIMENSION = 2048;

export interface ImageTranscodeResult {
  pathPrimary: string; // .avif
  pathFallback: string; // .webp
  mimePrimary: "image/avif";
  mimeFallback: "image/webp";
  width: number;
  height: number;
  sizeBytesPrimary: number;
}

/**
 * Transcodes a source image to AVIF (primary) + WebP (fallback).
 * Quality tuned for "AI can recognize details" rather than visual perfection.
 */
export async function transcodeImage(sourcePath: string, outputBase: string): Promise<ImageTranscodeResult> {
  await mkdir(dirname(outputBase), { recursive: true });

  const meta = await sharp(sourcePath).metadata();
  const baseWidth = meta.width ?? 0;
  const baseHeight = meta.height ?? 0;

  const pipeline = sharp(sourcePath).rotate(); // honor EXIF orientation
  if (baseWidth > MAX_DIMENSION || baseHeight > MAX_DIMENSION) {
    pipeline.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside" });
  }
  // Strip metadata for privacy/size.

  const avifPath = `${outputBase}.avif`;
  const webpPath = `${outputBase}.webp`;

  const avifBuf = await pipeline.clone().avif({ quality: AVIF_QUALITY, effort: 4 }).toBuffer();
  await writeFile(avifPath, avifBuf);
  const webpBuf = await pipeline.clone().webp({ quality: WEBP_QUALITY }).toBuffer();
  await writeFile(webpPath, webpBuf);

  // Get final dimensions (post-resize).
  const finalMeta = await sharp(avifBuf).metadata();

  return {
    pathPrimary: avifPath,
    pathFallback: webpPath,
    mimePrimary: "image/avif",
    mimeFallback: "image/webp",
    width: finalMeta.width ?? baseWidth,
    height: finalMeta.height ?? baseHeight,
    sizeBytesPrimary: avifBuf.length,
  };
}
