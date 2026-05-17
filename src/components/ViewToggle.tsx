"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3 } from "lucide-react";

const STORAGE_KEY = "view:open-work";

/**
 * Grid / Table view toggle for /open-work.
 *
 * Persistence has two layers:
 *  1. The active choice lives in the `view` URL search param so the URL is
 *     shareable and survives reload / pagination.
 *  2. The chosen mode is also written to localStorage so a fresh visit to
 *     /open-work (no `?view=` param) restores the last preference.
 *
 * On mount: if the URL has no `view` param but localStorage holds `"table"`,
 * we replace the URL once to add it (no scroll). Grid is the default, so
 * we don't need to redirect for the "grid" case.
 */
export function ViewToggle({ current }: { current: "grid" | "table" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    // Only restore when the URL didn't explicitly specify a view.
    if (searchParams.get("view") !== null) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* private mode etc. — non-fatal */
    }
    if (stored === "table") {
      const next = new URLSearchParams(searchParams.toString());
      next.set("view", "table");
      router.replace(`/open-work?${next.toString()}`, { scroll: false });
    }
  }, [router, searchParams]);

  function set(v: "grid" | "table") {
    if (v === current) return;
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* private mode etc. — non-fatal */
    }
    const next = new URLSearchParams(searchParams.toString());
    if (v === "grid") next.delete("view"); // grid is the default
    else next.set("view", v);
    const qs = next.toString();
    router.replace(`/open-work${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <div role="group" aria-label="View mode" className="view-toggle">
      <button
        type="button"
        className={`view-toggle-btn${current === "grid" ? " active" : ""}`}
        aria-pressed={current === "grid"}
        onClick={() => set("grid")}
        title="Grid view"
      >
        <LayoutGrid size="1em" aria-hidden /> Grid
      </button>
      <button
        type="button"
        className={`view-toggle-btn${current === "table" ? " active" : ""}`}
        aria-pressed={current === "table"}
        onClick={() => set("table")}
        title="Table view"
      >
        <Rows3 size="1em" aria-hidden /> Table
      </button>
    </div>
  );
}
