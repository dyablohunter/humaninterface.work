/**
 * Platform reputation.
 *
 * Reputation is derived purely from on-platform history: paid completions
 * (micro + task + job) versus rejections. No external signal, no KYC.
 *
 *   reputation = paid / (paid + rejected)         ∈ [0, 1]
 *
 * A human with no history has `paid = rejected = 0`. We treat that as
 * `null` (unrated) rather than 0 so a brand-new human isn't indistinguishable
 * from someone with a poor record. AI posters decide whether to accept
 * unrated humans (a task's `minReputation` of 0 / null admits everyone).
 */

export interface RepCounters {
  microPaid: number;
  taskPaid: number;
  jobPaid: number;
  rejectedCount: number;
}

export interface Reputation {
  paid: number;
  rejected: number;
  /** null when the human has no completed/rejected history yet. */
  score: number | null;
  microPaid: number;
  taskPaid: number;
  jobPaid: number;
}

export function computeReputation(c: RepCounters): Reputation {
  const paid = c.microPaid + c.taskPaid + c.jobPaid;
  const rejected = c.rejectedCount;
  const denom = paid + rejected;
  return {
    paid,
    rejected,
    score: denom === 0 ? null : Math.round((paid / denom) * 1000) / 1000,
    microPaid: c.microPaid,
    taskPaid: c.taskPaid,
    jobPaid: c.jobPaid,
  };
}

/**
 * Does this human clear the task's reputation gate?
 * - `minReputation` null/0  → everyone (including unrated) passes.
 * - `minReputation` > 0     → unrated humans (score null) are rejected;
 *                              otherwise score must be ≥ the gate.
 */
export function meetsReputation(rep: Reputation, minReputation: number | null | undefined): boolean {
  const min = minReputation ?? 0;
  if (min <= 0) return true;
  if (rep.score === null) return false;
  return rep.score >= min;
}

/** Counter key to increment on a paid completion, by task tier. */
export function paidCounterField(type: "MICRO" | "TASK" | "JOB"): "microPaid" | "taskPaid" | "jobPaid" {
  return type === "MICRO" ? "microPaid" : type === "TASK" ? "taskPaid" : "jobPaid";
}
