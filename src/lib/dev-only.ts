import { NextResponse } from "next/server";

/**
 * Hard-gates a route to non-production environments. Returns a 404 in
 * production so the endpoint is indistinguishable from a missing route.
 *
 * Use at the top of any admin/test-* handler:
 *   const denied = assertDevOnly();
 *   if (denied) return denied;
 */
export function assertDevOnly(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

export function isDevOnlyEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
