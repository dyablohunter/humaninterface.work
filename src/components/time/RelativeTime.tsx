"use client";

import { useEffect, useState } from "react";
import { useTimezone } from "./TimezoneProvider";

/**
 * Relative-time string like "3 minutes ago", "yesterday", "2 weeks ago" using
 * `Intl.RelativeTimeFormat`. Auto-refreshes every 60s when the timestamp is
 * within the last hour, otherwise stays static (no timers).
 *
 * Relative time is mostly a function of the absolute ms delta, so the viewer's
 * timezone doesn't change the bucket — but we still surface it on `<time>` via
 * the ISO `dateTime` attribute and the verbatim Unix-ms `title`.
 *
 * Renders `defaultPlaceholder` until mounted to avoid hydration mismatch.
 */
function relativeString(ts: number, now: number): string {
  const diffMs = ts - now;
  const past = diffMs < 0;
  const absSec = Math.abs(diffMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (absSec < 45) return past ? "just now" : "in a moment";
  if (absSec < 90) return rtf.format(past ? -1 : 1, "minute");
  const absMin = absSec / 60;
  if (absMin < 45) return rtf.format(past ? -Math.round(absMin) : Math.round(absMin), "minute");
  const absHr = absMin / 60;
  if (absHr < 22) return rtf.format(past ? -Math.round(absHr) : Math.round(absHr), "hour");
  const absDay = absHr / 24;
  if (absDay < 26) return rtf.format(past ? -Math.round(absDay) : Math.round(absDay), "day");
  const absWk = absDay / 7;
  if (absWk < 6) return rtf.format(past ? -Math.round(absWk) : Math.round(absWk), "week");
  const absMo = absDay / 30;
  if (absMo < 11) return rtf.format(past ? -Math.round(absMo) : Math.round(absMo), "month");
  const absYr = absDay / 365;
  return rtf.format(past ? -Math.round(absYr) : Math.round(absYr), "year");
}

export function RelativeTime({
  ts,
  defaultPlaceholder = "—",
  timezone: _timezone,
}: {
  ts: number | null | undefined;
  defaultPlaceholder?: string;
  /** Accepted for API symmetry with the other formatters; not used here. */
  timezone?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  // Touch the context so the prop overload follows the same shape as siblings.
  useTimezone(_timezone);

  useEffect(() => {
    setNow(Date.now());
    if (ts == null) return;
    // Only tick if the timestamp is recent (within the last hour) — older
    // points won't change their rendered string from minute to minute.
    const ageMs = Math.abs(Date.now() - ts);
    if (ageMs < 60 * 60 * 1000) {
      const id = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(id);
    }
  }, [ts]);

  if (ts == null) return <>{defaultPlaceholder}</>;

  const iso = new Date(ts).toISOString();
  const title = `Server UNIX Date/Time: ${ts}`;

  if (now === null) {
    return (
      <time dateTime={iso} title={title} suppressHydrationWarning>
        {defaultPlaceholder}
      </time>
    );
  }
  return (
    <time dateTime={iso} title={title}>
      {relativeString(ts, now)}
    </time>
  );
}
