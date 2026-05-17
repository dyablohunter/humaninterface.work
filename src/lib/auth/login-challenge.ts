import { createHmac, timingSafeEqual } from "node:crypto";

export const CHALLENGE_COOKIE = "hi_login_challenge";
export const CHALLENGE_TTL_SEC = 10 * 60;

function getSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be at least 16 characters");
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface ChallengePayload {
  pubkey: string;
  nonce: string;
  issuedAt: string;
  exp: number;
}

export function encodeChallenge(payload: ChallengePayload): string {
  const json = Buffer.from(JSON.stringify(payload));
  const p = b64url(json);
  const sig = b64url(createHmac("sha256", getSecret()).update(p).digest());
  return `${p}.${sig}`;
}

export function decodeChallenge(token: string): ChallengePayload | null {
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const expected = b64url(createHmac("sha256", getSecret()).update(p).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(p).toString("utf8")) as ChallengePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
