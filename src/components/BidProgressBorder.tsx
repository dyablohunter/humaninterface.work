"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Wraps a card and draws a 2px conic-gradient ring around it that drains as
 * the bidding window elapses. At post-time the ring is fully `color`; at
 * `closesAt` it has fully drained to the muted border color.
 *
 * `closesAt` and `windowMs` together define the linear fraction remaining:
 *   remaining = (closesAt - now) / windowMs
 *
 * Updates every 5 seconds — visually imperceptible jumps and cheap enough to
 * run on dozens of cards at once.
 */
export function BidProgressBorder({
  closesAt,
  windowMs,
  color,
  children,
  className,
}: {
  closesAt: number;
  windowMs: number;
  color: string;
  children: ReactNode;
  className?: string;
}) {
  const [angle, setAngle] = useState(360);

  useEffect(() => {
    function tick() {
      const remaining = Math.max(0, Math.min(1, (closesAt - Date.now()) / windowMs));
      setAngle(remaining * 360);
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [closesAt, windowMs]);

  const style = {
    "--bid-angle": `${angle}deg`,
    "--bid-color": color,
  } as CSSProperties & Record<string, string>;

  return (
    <div className={`bid-progress${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}
