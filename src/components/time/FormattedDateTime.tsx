"use client";

import { useEffect, useState } from "react";
import { useTimezone } from "./TimezoneProvider";

/**
 * Date + time in the viewer's locale, e.g. "May 17, 2026, 1:05 PM".
 *
 * Formats in the viewer's IP-derived timezone (provided by `TimezoneProvider`),
 * with an optional `timezone` prop override. Renders `defaultPlaceholder`
 * until mounted to avoid hydration mismatch.
 *
 * The rendered `<time>` element carries:
 *   - `dateTime` — ISO 8601 string for machines / a11y / SEO.
 *   - `title`    — verbatim `"Server UNIX Date/Time: <ms>"` for hover inspection.
 */
export function FormattedDateTime({
  ts,
  defaultPlaceholder = "—",
  timezone,
}: {
  ts: number | null | undefined;
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

  return (
    <time dateTime={iso} title={title}>
      {new Date(ts).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      })}
    </time>
  );
}
