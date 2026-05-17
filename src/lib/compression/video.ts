import ffmpeg from "fluent-ffmpeg";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";

const AV1_CRF = 35;
const VP9_CRF = 32;
const MAX_HEIGHT = 720;

export interface VideoTranscodeResult {
  pathPrimary: string; // .av1.mp4
  pathFallback: string; // .vp9.webm
  mimePrimary: "video/mp4";
  mimeFallback: "video/webm";
  durationSec: number;
  width: number;
  height: number;
  sizeBytesPrimary: number;
}

function probe(sourcePath: string): Promise<ffmpeg.FfprobeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(sourcePath, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

function transcodeAV1(src: string, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(src)
      .videoCodec("libsvtav1")
      .audioCodec("aac")
      .audioBitrate("96k")
      .outputOptions([
        `-crf ${AV1_CRF}`,
        `-preset 8`,
        `-vf scale='if(gt(ih,${MAX_HEIGHT}),-2,iw)':'if(gt(ih,${MAX_HEIGHT}),${MAX_HEIGHT},ih)'`,
        "-movflags +faststart",
      ])
      .format("mp4")
      .output(dst)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

function transcodeVP9(src: string, dst: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(src)
      .videoCodec("libvpx-vp9")
      .audioCodec("libopus")
      .audioBitrate("96k")
      .outputOptions([
        `-crf ${VP9_CRF}`,
        "-b:v 0",
        `-vf scale='if(gt(ih,${MAX_HEIGHT}),-2,iw)':'if(gt(ih,${MAX_HEIGHT}),${MAX_HEIGHT},ih)'`,
        "-row-mt 1",
        "-deadline good",
      ])
      .format("webm")
      .output(dst)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

export async function transcodeVideo(sourcePath: string, outputBase: string): Promise<VideoTranscodeResult> {
  await mkdir(dirname(outputBase), { recursive: true });

  const meta = await probe(sourcePath);
  const stream = meta.streams.find((s) => s.codec_type === "video");
  const duration = Math.round(Number(meta.format.duration ?? 0));
  const width = Number(stream?.width ?? 0);
  const height = Number(stream?.height ?? 0);

  const av1Path = `${outputBase}.av1.mp4`;
  const vp9Path = `${outputBase}.vp9.webm`;

  // Run AV1 first (primary). Fall through to VP9.
  await transcodeAV1(sourcePath, av1Path);
  await transcodeVP9(sourcePath, vp9Path);

  const av1Stat = await stat(av1Path);

  return {
    pathPrimary: av1Path,
    pathFallback: vp9Path,
    mimePrimary: "video/mp4",
    mimeFallback: "video/webm",
    durationSec: duration,
    width,
    height,
    sizeBytesPrimary: av1Stat.size,
  };
}
