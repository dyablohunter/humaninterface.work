"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

/**
 * Header theme toggle. Persists choice in localStorage as `theme`. On first
 * visit, no explicit choice - CSS falls back to `@media (prefers-color-scheme)`
 * via globals.css. A pre-paint script in the root layout applies the stored
 * value to `<html data-theme>` before React hydrates, so there is no flash.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Read whatever the pre-paint script (or OS preference) settled on.
    const dataset = document.documentElement.dataset.theme as Theme | "" | undefined;
    const initial: Theme =
      dataset === "light" || dataset === "dark"
        ? dataset
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode etc. - non-fatal */
    }
  }

  // Render an inert placeholder until we know the theme, to keep server +
  // first-client paint identical (icon depends on theme state).
  if (theme === null) {
    return (
      <button
        type="button"
        className="nav-toggle theme-toggle"
        aria-label="Toggle theme"
        disabled
      >
        <Sun size={18} aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      className="nav-toggle theme-toggle"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      aria-pressed={theme === "dark"}
      onClick={toggle}
    >
      {theme === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
