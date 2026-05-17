/**
 * IP -> ISO 3166-1 alpha-2 country code lookup.
 *
 * Backed by `geoip-country` (embedded MaxMind GeoLite2 country DB, MIT).
 * The lookup is purely in-process — no external API call, no rate limits,
 * no IP leakage to third parties. The IP is never persisted: it's read from
 * the incoming request, used to resolve a country, then discarded.
 *
 * GeoLite2 attribution: "This product includes GeoLite2 data created by
 * MaxMind, available from https://www.maxmind.com." (See node_modules/
 * geoip-country/LICENSE.)
 */

import geoip from "geoip-country";

/**
 * Extract a likely client IP from a request's headers. Preference order:
 *
 *   1. `x-forwarded-for` (first entry — the original client behind a proxy/CDN)
 *   2. `x-real-ip`       (common reverse-proxy header)
 *   3. `cf-connecting-ip` (Cloudflare)
 *
 * Returns `null` if no usable IP can be found.
 */
export function extractClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = headers.get("x-real-ip");
  if (xri) return xri.trim();
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  return null;
}

/**
 * Resolve an IP address to an ISO 3166-1 alpha-2 country code.
 *
 * Returns `null` for null/loopback/private/unknown IPs. Never throws.
 */
export function ipToCountry(ip: string | null): string | null {
  if (!ip) return null;
  // Loopback / link-local: geoip-country would return null anyway, short-circuit.
  if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.")) return null;
  try {
    const lookup = geoip.lookup(ip);
    if (!lookup || !lookup.country) return null;
    return lookup.country.toUpperCase();
  } catch {
    return null;
  }
}
