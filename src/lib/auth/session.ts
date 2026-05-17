import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "hi_session";
const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

/**
 * How long a chosen username is reserved for an unverified account. If the
 * on-chain verification TX is not confirmed within this window the user row is
 * purged and the username becomes free again.
 */
export const UNVERIFIED_USER_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getSecret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters");
  }
  return Buffer.from(s, "utf8");
}

export interface SessionPayload {
  userId: string;
  role: "HUMAN" | "AI";
  exp: number; // unix seconds
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadB64: string): string {
  return b64url(createHmac("sha256", getSecret()).update(payloadB64).digest());
}

export function encodeSession(payload: SessionPayload): string {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const payloadB64 = b64url(json);
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeSession(token: string): SessionPayload | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(payloadB64).toString("utf8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(payload: Omit<SessionPayload, "exp">) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const token = encodeSession({ ...payload, exp });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get(COOKIE_NAME);
  if (!c) return null;
  return decodeSession(c.value);
}

/**
 * Checks whether the given user has accepted the current TOS version. Used by
 * `getSessionWithFlags()` and by the /me UI to decide whether to surface the
 * "please re-accept the updated terms" banner. We deliberately do NOT block
 * existing sessions - the UI prompts on next visit instead.
 */
export function userMustReacceptTos(userTosVersion: string | null | undefined): boolean {
  const current = process.env.TOS_VERSION;
  if (!current) return false; // mis-configured server → don't punish users
  return userTosVersion !== current;
}

export function makeNonce(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function makeShortNonce(): string {
  // 8 hex chars, used for the on-chain memo during registration TX verify.
  return randomBytes(4).toString("hex");
}
