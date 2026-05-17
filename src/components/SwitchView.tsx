"use client";

import { useState, type ReactNode } from "react";

export interface SwitchOption {
  id: string;
  label: string;
  badge?: number;
  content: ReactNode;
}

/**
 * Segmented radio-style control with N options. All panels are rendered
 * server-side and passed in as `content`; clicking a segment toggles which
 * one is visible. Useful for nesting a small set of related views inside a
 * single parent tab (e.g. Contact / Suggestions; or the moderation queues).
 */
export function SwitchView({ options }: { options: SwitchOption[] }) {
  const [active, setActive] = useState(options[0]?.id);
  return (
    <>
      <div className="switch" role="group" aria-label="View">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={active === o.id ? "switch-on" : ""}
            aria-pressed={active === o.id}
            onClick={() => setActive(o.id)}
          >
            {o.label}
            {o.badge ? <span className="switch-badge">{o.badge}</span> : null}
          </button>
        ))}
      </div>
      {options.map((o) => (
        <div key={o.id} hidden={active !== o.id}>
          {o.content}
        </div>
      ))}
    </>
  );
}
