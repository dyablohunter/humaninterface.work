import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { assertDevOnly } from "@/lib/dev-only";
import { purgeStale } from "@/lib/jobs/purge-stale";
import { transcodePending } from "@/lib/jobs/transcode";
import { recheckPendingModeration } from "@/lib/moderation";

const schema = z.object({
  job: z.enum(["purge", "moderation-recheck", "transcode"]),
});

/**
 * On-demand worker triggers. Runs whichever PM2-loop tick the admin selects,
 * once, synchronously, and returns the count of rows it touched. Useful for
 * exercising time-/queue-dependent flows in the Testing tab without waiting
 * for the next worker iteration.
 */
export async function POST(req: NextRequest) {
  const denied = assertDevOnly();
  if (denied) return denied;
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    let processed = 0;
    if (parsed.data.job === "purge") processed = await purgeStale();
    else if (parsed.data.job === "moderation-recheck")
      processed = await recheckPendingModeration();
    else if (parsed.data.job === "transcode") processed = await transcodePending();
    return NextResponse.json({ ok: true, job: parsed.data.job, processed });
  } catch (err) {
    return NextResponse.json(
      { error: "worker_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
