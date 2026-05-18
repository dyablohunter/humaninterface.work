import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { assertDevOnly } from "@/lib/dev-only";
import { ensureTestAiUser, signTestAiRequest } from "@/lib/test-ai";

const schema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  /** Must start with `/` and stay under /api/v1/ for safety. */
  path: z.string().min(1).max(500),
  body: z.unknown().optional(),
  /** `ai` signs with the test AI keypair; `admin` forwards the admin cookie. */
  as: z.enum(["ai", "admin"]).default("ai"),
  /**
   * Explicit confirmation required for `as: "ai"` so a leaked XSS that doesn't
   * know this key cannot use the proxy to sign requests with the test AI
   * keypair. The Testing-tab UI sets this automatically.
   */
  confirmTestAi: z.boolean().optional(),
});

/**
 * Admin testing proxy. Lets the Testing tab call any /api/v1 endpoint either
 *   - signed by the configured test AI keypair (`as: "ai"`), so AI-only
 *     endpoints like POST /tasks, /confirm-deposit, /slots/:id/decide can be
 *     exercised end-to-end, or
 *   - forwarded with the admin's session cookie (`as: "admin"`) for cookie
 *     authenticated endpoints.
 *
 * Same-origin only. Always JSON. Returns the upstream status code in
 * `upstreamStatus` and the parsed JSON / raw text body in `data` / `text`.
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
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { method, as } = parsed.data;
  if (as === "ai" && parsed.data.confirmTestAi !== true) {
    return NextResponse.json(
      { error: "confirm_test_ai_required" },
      { status: 400 },
    );
  }
  let path = parsed.data.path.trim();
  if (!path.startsWith("/")) path = "/" + path;
  // Reject path traversal / Windows-style separators before URL resolution.
  if (path.includes("..") || path.includes("\\")) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  // Reject protocol-relative (`//host/...`) or scheme-prefixed URLs that would
  // make `new URL(path, origin)` resolve to an external host. (`new URL` would
  // happily parse `//evil.com/api/v1/x` as `https://evil.com/api/v1/x`.)
  if (path.startsWith("//") || /^\/[^/]*:/.test(path)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  if (!path.startsWith("/api/v1/")) {
    return NextResponse.json({ error: "path_must_target_/api/v1/" }, { status: 400 });
  }

  const url = new URL(path, req.nextUrl.origin);
  // Final origin guard: the resolved URL must point back at us. If `path`
  // somehow re-introduced an external host (e.g. via a future URL parser
  // quirk), refuse rather than fan the request out.
  if (url.origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  // Block re-entrant calls to this endpoint to prevent recursion / loops.
  if (/^\/api\/v1\/admin\/test-call(\/|$)/.test(url.pathname)) {
    return NextResponse.json({ error: "reentrant_call_forbidden" }, { status: 400 });
  }
  // No admin-on-admin pivots. The `as: "admin"` mode forwards the live admin
  // cookie to the upstream; allowing it to call other /api/v1/admin/* routes
  // would let any CSRF/XSS into this endpoint reach every admin action in one
  // hop. Test-AI signed mode would not be admin-authed at the upstream, but
  // disallow it too for symmetry.
  if (/^\/api\/v1\/admin\//.test(url.pathname)) {
    return NextResponse.json({ error: "admin_pivot_forbidden" }, { status: 400 });
  }
  // Re-check normalised pathname for traversal sneaking through URL parsing.
  if (!url.pathname.startsWith("/api/v1/") || url.pathname.includes("..")) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  const rawBody =
    method === "GET" || parsed.data.body == null ? "" : JSON.stringify(parsed.data.body);
  const headers: Record<string, string> = { "content-type": "application/json" };

  if (as === "ai") {
    await ensureTestAiUser();
    try {
      Object.assign(headers, signTestAiRequest({ method, path: url.pathname, rawBody }));
    } catch (err) {
      return NextResponse.json(
        { error: "test_ai_not_configured", detail: err instanceof Error ? err.message : "" },
        { status: 500 },
      );
    }
  } else {
    // Forward the admin's session cookie so cookie-auth endpoints accept it.
    const cookie = req.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : rawBody,
      // Same-origin fetch from the server; no need for redirect/credential
      // handling. The server is the upstream.
    });
  } catch (err) {
    return NextResponse.json(
      { error: "upstream_unreachable", detail: err instanceof Error ? err.message : "" },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON - leave data null, expose raw text */
  }

  return NextResponse.json({
    ok: upstream.ok,
    upstreamStatus: upstream.status,
    data,
    text: data == null ? text : undefined,
  });
}
