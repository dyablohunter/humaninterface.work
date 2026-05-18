import type { NextConfig } from "next";

/**
 * Static security headers applied to every response. The CSP itself is set
 * by ./proxy.ts so we can emit a per-request `'nonce-...'` token and drop
 * `'unsafe-inline'` from `script-src`. The headers below are policy
 * statements that don't vary per request — keeping them here lets API
 * responses (which the proxy skips) still ship them.
 */
const isProd = process.env.NODE_ENV === "production";

const securityHeaders: { key: string; value: string }[] = [
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
  // `geoip-country` reads its data file from disk at runtime via __dirname.
  // Turbopack would otherwise bundle the package into the server chunk and
  // strip the data file, causing ENOENT at module load. Keep it external so
  // it's required from node_modules normally.
  serverExternalPackages: ["geoip-country"],
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
