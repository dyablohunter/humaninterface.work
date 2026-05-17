import { NextResponse } from "next/server";

/**
 * DEPRECATED. First-come claiming was replaced by the reverse-auction model.
 * Submit a bid to `POST /api/v1/tasks/:id/bid` instead - a bid at or below the
 * task's instantAcceptUsdt is awarded immediately, which is the equivalent of
 * the old "claim".
 */
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_removed", use: "POST /api/v1/tasks/:id/bid" },
    { status: 410 },
  );
}
