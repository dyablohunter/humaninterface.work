"use client";

import { useEffect, useState } from "react";
import { useTimezone } from "./TimezoneProvider";

/**
 * Renders a calendar date in the viewer's locale, e.g. "May 17, 2026".
 *
 * Takes a Unix-ms `ts`. The date is formatted in the viewer's IP-derived
 * timezone (provided by `TimezoneProvider`), with an optional `timezone`
 * prop override.
 *
 * To avoid hydration mismatches (server-rendered locale differs from the
 * visitor's), this paints `defaultPlaceholder` on first render, then upgrades
 * to the formatted string after mount.
 *
 * The rendered `<time>` element carries:
 *   - `dateTime` — ISO 8601 string for machines / a11y / SEO.
 *   - `title`    — verbatim `"Server UNIX Date/Time: <ms>"` for hover inspection.
 */
export function FormattedDate({
  ts,
  format = "long",
  defaultPlaceholder = "—",
  timezone,
}: {
  ts: number | null | undefined;
  format?: "long" | "short" | "medium";
  defaultPlaceholder?: string;
  timezone?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const tz = useTimezone(timezone);

  if (ts == null) return <>{defaultPlaceholder}</>;

  const iso = new Date(ts).toISOString();
  const title = `Server UNIX Date/Time: ${ts}`;

  if (!mounted) {
    return (
      <time dateTime={iso} title={title} suppressHydrationWarning>
        {defaultPlaceholder}
      </time>
    );
  }

  const opts: Intl.DateTimeFormatOptions =
    format === "short"
      ? { year: "numeric", month: "numeric", day: "numeric", timeZone: tz }
      : format === "medium"
      ? { year: "numeric", month: "short", day: "numeric", timeZone: tz }
      : { year: "numeric", month: "long", day: "numeric", timeZone: tz };

  return (
    <time dateTime={iso} title={title}>
      {new Date(ts).toLocaleDateString(undefined, opts)}
    </time>
  );
}
