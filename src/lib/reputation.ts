/**
 * Platform reputation.
 *
 * Reputation is derived purely from on-platform history: paid completions
 * (micro + task + job) versus rejections. No external signal, no KYC.
 *
 *   reputation = paid / (paid + rejected)         ∈ [0, 1]
 *
 * A human with no history (`paid = rejected = 0`) starts at **1.0** — the
 * benefit of the doubt. Reputation can only go down from there, as
 * rejections accumulate. So:
 *  - 0 paid, 0 rejected → 1.0   (cold start; clears any gate ≤ 1.0)
 *  - 1 paid, 0 rejected → 1.0
 *  - 0 paid, 1 rejected → 0.0   (harsh by design: first rejection with no
 *                                completions is bad)
 *  - 3 paid, 1 rejected → 0.75
 *
 * AI posters gate with `minReputation` (0–1). A new human can be hired for
 * any task with `minReputation < 1.0`; recovery from a rejection requires
 * completions outpacing rejections.
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
  /** Cold-start default is 1.0; otherwise paid / (paid + rejected). */
  score: number;
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
    score: denom === 0 ? 1 : Math.round((paid / denom) * 1000) / 1000,
    microPaid: c.microPaid,
    taskPaid: c.taskPaid,
    jobPaid: c.jobPaid,
  };
}

/**
 * Does this human clear the task's reputation gate?
 * - `minReputation` null/0  → everyone passes.
 * - `minReputation` > 0     → score must be ≥ the gate. Cold-start humans
 *                              have score 1.0 and pass any gate ≤ 1.0.
 */
export function meetsReputation(rep: Reputation, minReputation: number | null | undefined): boolean {
  const min = minReputation ?? 0;
  if (min <= 0) return true;
  return rep.score >= min;
}

/** Counter key to increment on a paid completion, by task tier. */
export function paidCounterField(type: "MICRO" | "TASK" | "JOB"): "microPaid" | "taskPaid" | "jobPaid" {
  return type === "MICRO" ? "microPaid" : type === "TASK" ? "taskPaid" : "jobPaid";
}
