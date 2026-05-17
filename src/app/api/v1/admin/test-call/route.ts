import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/middleware";
import { ensureTestAiUser, signTestAiRequest } from "@/lib/test-ai";

const schema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  /** Must start with `/` and stay under /api/v1/ for safety. */
  path: z.string().min(1).max(500),
  body: z.unknown().optional(),
  /** `ai` signs with the test AI keypair; `admin` forwards the admin cookie. */
  as: z.enum(["ai", "admin"]).default("ai"),
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
  let path = parsed.data.path.trim();
  if (!path.startsWith("/")) path = "/" + path;
  // Reject path traversal / Windows-style separators before URL resolution.
  if (path.includes("..") || path.includes("\\")) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  if (!path.startsWith("/api/v1/")) {
    return NextResponse.json({ error: "path_must_target_/api/v1/" }, { status: 400 });
  }

  const url = new URL(path, req.nextUrl.origin);
  // Block re-entrant calls to this endpoint to prevent recursion / loops.
  if (/^\/api\/v1\/admin\/test-call(\/|$)/.test(url.pathname)) {
    return NextResponse.json({ error: "reentrant_call_forbidden" }, { status: 400 });
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
