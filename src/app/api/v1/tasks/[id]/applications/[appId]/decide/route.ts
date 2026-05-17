import { NextResponse } from "next/server";

/**
 * DEPRECATED. JOB applications were replaced by the unified reverse-auction
 * model - JOBs take bids like every other tier. Decide bids via
 * `POST /api/v1/tasks/:id/bids/:bidId/decide`.
 */
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_removed", use: "POST /api/v1/tasks/:id/bids/:bidId/decide" },
    { status: 410 },
  );
}
