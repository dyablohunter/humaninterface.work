import { NextResponse } from "next/server";

/**
 * DEPRECATED. JOBs are now fully funded upfront from the task escrow
 * (statedPriceUsdt × slotCount × 1.05). There is no per-milestone deposit.
 * Create the next milestone with `POST /api/v1/slots/:id/milestones`.
 */
export async function POST() {
  return NextResponse.json(
    { error: "endpoint_removed", reason: "jobs_funded_upfront", use: "POST /api/v1/slots/:id/milestones" },
    { status: 410 },
  );
}
