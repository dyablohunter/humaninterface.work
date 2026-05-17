"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

/**
 * Live countdown to an ISO deadline. Renders e.g. "2d 4h 12m" and ticks once
 * a minute (seconds shown only under an hour). Shows "expired" once passed.
 */
export function Countdown({ target, className }: { target: string; className?: string }) {
  // Render nothing time-dependent until mounted: Date.now() and locale-based
  // date formatting both differ between server and client and would otherwise
  // cause a hydration mismatch.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) {
    return <span className={className} suppressHydrationWarning />;
  }

  const ms = new Date(target).getTime() - now;
  if (Number.isNaN(ms)) return null;

  const iconStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    verticalAlign: "-0.15em",
  } as const;

  if (ms <= 0) {
    return (
      <span className={className} style={{ color: "var(--danger)", ...iconStyle }}>
        <Timer size="1em" aria-hidden />
        expired
      </span>
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
    <span
      className={className}
      title={`Deadline: ${new Date(target).toLocaleString()}`}
      style={urgent ? { color: "var(--danger)", fontWeight: 600, ...iconStyle } : iconStyle}
    >
      <Timer size="1em" aria-hidden />
      {label} left
    </span>
  );
}
