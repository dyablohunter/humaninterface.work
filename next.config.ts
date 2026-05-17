import type { NextConfig } from "next";

/**
 * Security headers. The Next 16 `headers()` config function (see
 * node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md)
 * still takes `{ source, headers: [{ key, value }] }`. We apply ours to all
 * routes via `source: "/(.*)"`.
 *
 * CSP notes:
 * - `script-src` includes `'unsafe-inline'` because src/app/layout.tsx:30-36
 *   inlines a small theme-bootstrap <script> to avoid FOUC. Removing
 *   `'unsafe-inline'` requires moving that script to a static file or adopting
 *   a per-request nonce middleware. We accept inline scripts for now and
 *   document the tradeoff.
 * - `connect-src` includes the Solana RPC URL from NEXT_PUBLIC_SOLANA_RPC_URL
 *   so the wallet adapter can reach the cluster.
 * - `script-src` adds `'unsafe-eval'` in development because React + Turbopack
 *   use eval() for HMR / source-map reconstruction. Production never gets it.
 */
const isProd = process.env.NODE_ENV === "production";

const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();
let extraConnect = "";
if (solanaRpc) {
  try {
    const u = new URL(solanaRpc);
    // Allow both http(s) and ws(s) variants of the configured host.
    extraConnect = ` ${u.origin} ${u.origin.replace(/^http/, "ws")}`;
  } catch {
    /* malformed env var; ignore */
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self'${extraConnect}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

if (isProd) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
