import type { TaskType, Urgency } from "@prisma/client";

/** Human-readable, non-shouty labels for the task tier + urgency enums. */
export const TYPE_LABEL: Record<TaskType, string> = {
  MICRO: "Micro",
  TASK: "Task",
  JOB: "Job",
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  URGENT: "Urgent",
  CRITICAL: "Critical",
};

/**
 * Turns a SHOUTY_ENUM value into a readable label for display:
 * "FAIRNESS_FLAGGED" → "Fairness flagged", "OPEN" → "Open".
 * Display only - never use where the literal value matters (API payloads,
 * comparisons, props consumed as enum keys).
 */
export function humanizeEnum(v: string): string {
  const s = v.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Per-tier card colour scheme - three shades of green, lightest for the
 * shortest tier (MICRO) to darkest for the longest (JOB).
 * `bg`/`border` tint the card; `fg` is the strong tier colour used for the
 * price (and any tier-coloured accents). Used on the homepage and work feed.
 */
export function tierTint(type: TaskType): { bg: string; border: string; fg: string } {
  // Return CSS variable references so the tints follow the active theme.
  switch (type) {
    case "MICRO":
      return {
        bg: "var(--tier-micro-bg)",
        border: "var(--tier-micro-border)",
        fg: "var(--tier-micro-fg)",
      };
    case "TASK":
      return {
        bg: "var(--tier-task-bg)",
        border: "var(--tier-task-border)",
        fg: "var(--tier-task-fg)",
      };
    case "JOB":
      return {
        bg: "var(--tier-job-bg)",
        border: "var(--tier-job-border)",
        fg: "var(--tier-job-fg)",
      };
    default:
      return { bg: "var(--surface)", border: "var(--border)", fg: "var(--fg)" };
  }
}

/**
 * Urgency tag colour, on a calm yellow → hot red spectrum: the more urgent
 * the task, the redder the tag. Used wherever the urgency tag is rendered.
 */
export function urgencyTint(urgency: Urgency): string {
  switch (urgency) {
    case "LOW":
      return "var(--urgency-low)";
    case "NORMAL":
      return "var(--urgency-normal)";
    case "URGENT":
      return "var(--urgency-urgent)";
    case "CRITICAL":
      return "var(--urgency-critical)";
    default:
      return "var(--fg-soft)";
  }
}
