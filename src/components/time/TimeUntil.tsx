"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Live countdown to a future Unix-ms timestamp. Renders e.g. "2d 4h 12m" and
 * ticks once a second. Once the deadline passes, renders `children` (or
 * defaults to "expired") so the caller can supply context-specific copy like
 * "bidding closed".
 *
 * No hydration-mismatch risk: time-dependent text is gated behind a mount
 * effect; before that, we render an empty `<time>` with `suppressHydrationWarning`.
 *
 * The output is wrapped in a `<time dateTime={iso} title="Server UNIX Date/Time: <ms>">`
 * so a viewer hovering the countdown sees the exact server timestamp.
 */
export function TimeUntil({
  ts,
  className,
  children,
}: {
  ts: number | null | undefined;
  className?: string;
  children?: ReactNode;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (ts == null) return null;

  const iso = new Date(ts).toISOString();
  const title = `Server UNIX Date/Time: ${ts}`;

  if (now === null) {
    return (
      <time
        className={className}
        dateTime={iso}
        title={title}
        suppressHydrationWarning
      />
    );
  }

  const ms = ts - now;
  if (Number.isNaN(ms)) return null;

  if (ms <= 0) {
    return (
      <time className={className} dateTime={iso} title={title}>
        {children ?? "expired"}
      </time>
    );
  }

  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  let label: string;
  if (d > 0) label = `${d}d ${h}h ${m}m`;
  else if (h > 0) label = `${h}h ${m}m`;
  else label = `${m}m ${sec}s`;

  return (
    <time className={className} dateTime={iso} title={title}>
      {label}
    </time>
  );
}
