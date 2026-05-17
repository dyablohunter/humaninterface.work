import { NextResponse } from "next/server";

/**
 * DEPRECATED. JOB applications were replaced by the unified reverse-auction
 * model - JOBs now take bids like every other tier. Submit a bid to
 * `POST /api/v1/tasks/:id/bid` (include an optional `message`).
 */
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_removed", use: "POST /api/v1/tasks/:id/bid" },
    { status: 410 },
  );
}
