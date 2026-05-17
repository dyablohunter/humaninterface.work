"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The visitor's preferred IANA timezone, as resolved by the server from the
 * client's IP-geolocated country. Defaults to `"UTC"` when the server can't
 * determine one (e.g. localhost, unrecognised IP, crawlers).
 *
 * Client code should generally use the `useTimezone()` hook, which falls back
 * to the browser's own local timezone when the context value is `"UTC"` — that
 * way a missing/unknown-IP user still sees dates in *something* sensible,
 * not raw UTC.
 */
const TimezoneContext = createContext<string>("UTC");

export function TimezoneProvider({
  timezone,
  children,
}: {
  timezone: string;
  children: ReactNode;
}) {
  return (
    <TimezoneContext.Provider value={timezone}>{children}</TimezoneContext.Provider>
  );
}

/**
 * Returns the effective IANA timezone for the current viewer. If the server
 * couldn't pin one down (value is `"UTC"`), falls back to the browser's local
 * zone so we still match the user's wall clock. Pass an `override` to force
 * a specific zone (e.g. a per-component `timezone` prop).
 */
export function useTimezone(override?: string): string {
  const ctx = useContext(TimezoneContext);
  if (override) return override;
  if (ctx && ctx !== "UTC") return ctx;
  // Fall back to the browser's local zone client-side. `resolvedOptions()` is
  // safe to call on the server too (will return the server's TZ), but we only
  // hit this path on the client because the formatters gate on a mount effect.
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
