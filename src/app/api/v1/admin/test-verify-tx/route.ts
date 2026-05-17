import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { fetchUsdtTransfer } from "@/lib/solana/verify-tx";

const schema = z.object({ signature: z.string().min(32).max(120) });

/**
 * On-chain transaction inspector. Pastes a Solana signature, runs the same
 * `fetchUsdtTransfer` helper used by `/confirm-deposit`, and surfaces what
 * the server would see (sender owner, recipient owner, USDT amount, memo,
 * blockTime).
 */
export async function POST(req: NextRequest) {
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
    const tx = await fetchUsdtTransfer(parsed.data.signature);
    if (!tx) {
      return NextResponse.json(
        { ok: false, error: "tx_not_found_or_not_a_usdt_transfer" },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, tx });
  } catch (err) {
    return NextResponse.json(
      { error: "rpc_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
