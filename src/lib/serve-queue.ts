import os from "node:os";

/**
 * Bounded-concurrency FIFO queue + free-memory guard for large file serves.
 *
 * Two layers of protection against the OOM vector in
 * `src/app/api/v1/evidence/[id]/route.ts`:
 *
 *   1. Concurrency cap. At most MAX_CONCURRENT serves are in flight at once.
 *      Excess requests wait in a FIFO queue; if the queue itself is full, we
 *      return null and the caller responds 503 with a Retry-After. This stops
 *      an attacker from opening thousands of parallel large-file reads.
 *
 *   2. Free-memory guard. Before admitting a request, we check
 *      `os.freemem()`. If serving this file would push the host below the
 *      MIN_FREE_BYTES floor (1.5 GB by default), we refuse. The floor is
 *      tunable via SERVE_MIN_FREE_BYTES.
 *
 * Streaming the file (via `createReadStream` in the route handler) means the
 * actual heap allocation per request is ~64 KB regardless of file size — the
 * memory guard is defense in depth in case the OS page cache or another
 * allocator pushes us close to the edge.
 */

const MAX_CONCURRENT = Number(process.env.SERVE_MAX_CONCURRENT ?? 8);
const MAX_QUEUE = Number(process.env.SERVE_MAX_QUEUE ?? 32);
const MIN_FREE_BYTES = Number(
  process.env.SERVE_MIN_FREE_BYTES ?? 1.5 * 1024 * 1024 * 1024,
);
/** Per-acquire timeout — keeps queued requests from hanging forever. */
const ACQUIRE_TIMEOUT_MS = Number(process.env.SERVE_ACQUIRE_TIMEOUT_MS ?? 30_000);

let inFlight = 0;
const waiters: Array<() => void> = [];

function takeNext() {
  const next = waiters.shift();
  if (next) next();
}

/**
 * Try to admit a serve. Returns a `release` function on success, or one of
 * the documented refusal codes:
 *   - "queue_full"        — too many already waiting
 *   - "insufficient_memory" — admitting would leave < MIN_FREE_BYTES free
 *   - "acquire_timeout"   — queued, but waited > ACQUIRE_TIMEOUT_MS
 *
 * Caller MUST invoke the returned `release` exactly once, in a `finally`.
 */
export async function acquireServeSlot(
  estimatedBytes: number,
): Promise<{ ok: true; release: () => void } | { ok: false; reason: string }> {
  // Memory guard first — cheaper than queuing and dropping.
  const free = os.freemem();
  if (free - estimatedBytes < MIN_FREE_BYTES) {
    return { ok: false, reason: "insufficient_memory" };
  }

  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return { ok: true, release: releaseOnce() };
  }

  if (waiters.length >= MAX_QUEUE) {
    return { ok: false, reason: "queue_full" };
  }

  const admitted = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(wake);
      if (i >= 0) waiters.splice(i, 1);
      resolve(false);
    }, ACQUIRE_TIMEOUT_MS);
    const wake = () => {
      clearTimeout(timer);
      resolve(true);
    };
    waiters.push(wake);
  });

  if (!admitted) return { ok: false, reason: "acquire_timeout" };

  // Re-check memory at the moment we'd actually start — conditions may have
  // changed while we waited in the queue.
  const freeNow = os.freemem();
  if (freeNow - estimatedBytes < MIN_FREE_BYTES) {
    takeNext();
    return { ok: false, reason: "insufficient_memory" };
  }

  inFlight++;
  return { ok: true, release: releaseOnce() };
}

function releaseOnce() {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight--;
    takeNext();
  };
}

export function serveQueueStats() {
  return {
    inFlight,
    waiting: waiters.length,
    maxConcurrent: MAX_CONCURRENT,
    maxQueue: MAX_QUEUE,
    minFreeBytes: MIN_FREE_BYTES,
    freeBytes: os.freemem(),
  };
}
