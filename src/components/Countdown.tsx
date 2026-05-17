"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

/**
 * Live countdown to a deadline expressed as Unix milliseconds (number).
 *
 * Renders e.g. "2d 4h 12m" and ticks once a second (seconds shown only under
 * an hour). Shows "expired" once passed. Goes red within 6 hours of expiry.
 *
 * Time-dependent text is gated behind a mount effect to avoid hydration
 * mismatches (`Date.now()` and locale formatting differ server vs. client).
 *
 * The root element is a `<time>` carrying `dateTime` (ISO) and `title`
 * (verbatim `"Server UNIX Date/Time: <ms>"`) so hovers reveal the exact
 * server timestamp the deadline was computed against.
 */
export function Countdown({ target, className }: { target: number; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const iso = new Date(target).toISOString();
  const title = `Server UNIX Date/Time: ${target}`;

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

  const ms = target - now;
  if (Number.isNaN(ms)) return null;

  const iconStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    verticalAlign: "-0.15em",
  } as const;

  if (ms <= 0) {
    return (
      <time
        className={className}
        dateTime={iso}
        title={title}
        style={{ color: "var(--danger)", ...iconStyle }}
      >
        <Timer size="1em" aria-hidden />
        expired
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

  const urgent = ms < 6 * 3600 * 1000; // < 6h

  return (
    <time
      className={className}
      dateTime={iso}
      title={title}
      style={urgent ? { color: "var(--danger)", fontWeight: 600, ...iconStyle } : iconStyle}
    >
      <Timer size="1em" aria-hidden />
      {label}
    </time>
  );
}
