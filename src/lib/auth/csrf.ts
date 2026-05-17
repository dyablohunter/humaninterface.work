import { NextRequest, NextResponse } from "next/server";

/**
 * Defense-in-depth CSRF check for cookie-authenticated state-changing routes.
 *
 * `sameSite: "lax"` already blocks the common CSRF vectors, but verifying the
 * Origin/Referer header against APP_BASE_URL closes the gap for browsers that
 * don't honor SameSite (very old) or for redirected/window.open flows that may
 * still send the cookie.
 *
 * Safe for GET/HEAD/OPTIONS - those are no-ops.
 *
 * On mismatch, throws `Error("csrf_origin_mismatch")`. Route handlers should
 * catch and translate to a 403 response, or let it bubble (Next will 500).
 * Call this BEFORE any DB writes.
 */
export function assertSameOrigin(req: NextRequest | Request): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const expectedBase =
    process.env.APP_BASE_URL?.trim() ||
    (req instanceof Request && "nextUrl" in req
      ? (req as NextRequest).nextUrl.origin
      : new URL((req as Request).url).origin);

  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(expectedBase).origin;
  } catch {
    throw new Error("csrf_origin_mismatch");
  }

  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== expectedOrigin) {
      throw new Error("csrf_origin_mismatch");
    }
    return;
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin !== expectedOrigin) {
        throw new Error("csrf_origin_mismatch");
      }
      return;
    } catch {
      throw new Error("csrf_origin_mismatch");
    }
  }

  // Neither Origin nor Referer present on a state-changing request from a
  // cookie-authenticated browser context is suspicious. Reject.
  throw new Error("csrf_origin_mismatch");
}

/**
 * Convenience wrapper that returns a 403 NextResponse on mismatch instead of
 * throwing. Use at the top of cookie-auth route handlers:
 *   const csrf = checkSameOrigin(req); if (csrf) return csrf;
 */
export function checkSameOrigin(req: NextRequest | Request): NextResponse | null {
  try {
    assertSameOrigin(req);
    return null;
  } catch {
    return NextResponse.json({ error: "csrf_origin_mismatch" }, { status: 403 });
  }
}
