"use client";

import { useState, type ReactNode } from "react";

export interface TabSection {
  id: string;
  label: string;
  badge?: number;
  content: ReactNode;
}

/**
 * Presentational tab switcher. All panels are rendered server-side and passed
 * in as `content`; tabs only toggle which one is visible (no refetch).
 */
export function MeTabs({ sections }: { sections: TabSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  return (
    <div className="tabs">
      <div className="tablist" role="tablist">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active === s.id}
            className={active === s.id ? "tab active" : "tab"}
            onClick={() => setActive(s.id)}
          >
            {s.label}
            {s.badge ? <span className="tab-badge">{s.badge}</span> : null}
          </button>
        ))}
      </div>
      {sections.map((s) => (
        <div
          key={s.id}
          role="tabpanel"
          hidden={active !== s.id}
          className="tabpanel"
        >
          {s.content}
        </div>
      ))}
    </div>
  );
}
