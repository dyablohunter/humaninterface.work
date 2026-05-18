import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce CSP. Next 16 calls this file `proxy.ts` (formerly
 * `middleware.ts`); see node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md.
 *
 * Why a proxy and not a static CSP in next.config.ts:
 *   `script-src` used to include `'unsafe-inline'` because the layout ships a
 *   small theme-bootstrap inline <Script>, and Next/React 19 inject their own
 *   inline scripts for hydration. Generating a fresh nonce per request and
 *   advertising it via `'nonce-...' 'strict-dynamic'` lets us drop
 *   `'unsafe-inline'` without breaking either.
 *
 * Cost: nonces force dynamic rendering. This codebase's root layout already
 * reads cookies (getSession + prisma.user.findUnique) so every route is
 * already dynamic — there is no static-output regression to pay for.
 *
 * The matcher below skips /api routes (CSP doesn't gate JSON responses) and
 * /_next/static (cacheable build output), so the proxy only runs on the HTML
 * surface.
 */

const isDev = process.env.NODE_ENV !== "production";

const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
let extraConnect = "";
if (solanaRpc) {
  try {
    const u = new URL(solanaRpc);
    extraConnect = ` ${u.origin} ${u.origin.replace(/^http/, "ws")}`;
  } catch {
    /* malformed env var; ignore */
  }
}

function buildCsp(nonce: string): string {
  // `'strict-dynamic'` makes the browser ignore allowlists in favour of
  // transitively trusting whatever the nonce'd script loads. In production
  // this means even framework chunks are gated by the nonce. In dev we keep
  // `'self'` listed alongside so Turbopack's HMR can refetch unhashed chunks
  // without bouncing off CSP.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scriptSrc,
    // React 19 still emits inline style attributes; keeping `'unsafe-inline'`
    // here is necessary and well-understood (inline style is not an XSS
    // primitive of practical concern).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self'${extraConnect}`,
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function proxy(req: NextRequest) {
  // 16 random bytes is plenty for a CSP nonce (per OWASP & Next docs).
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const nonce = Buffer.from(nonceBytes).toString("base64");

  const csp = buildCsp(nonce);

  // Pass the nonce + CSP into the rendering pipeline via request headers so
  // Next.js can extract the `'nonce-...'` token and stamp it onto framework
  // and bundle <script> tags automatically.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Skip API routes (JSON responses) and Next's static asset paths. Skip
  // prefetches as well — those are cached and don't need a fresh nonce.
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|js|css|woff|woff2|ttf|map)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
