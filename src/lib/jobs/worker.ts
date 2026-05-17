/**
 * Background worker process. Run with `npm run worker`.
 *
 * Responsibilities:
 *  - Purge stale (unfunded) PENDING_DEPOSIT tasks and milestones.
 *  - Poll the escrow USDT ATA for inbound USDT (SPL token) transfers and auto-confirm matches.
 *  - Transcode uploaded images/videos to AVIF/AV1 (+ fallbacks).
 *
 * Uses Postgres only - no Redis. For recurring tasks we use plain setInterval
 * inside this long-lived process.
 */

import { purgeStale } from "./purge-stale";
import { transcodePending } from "./transcode";
import { pollDeposits } from "./tx-poller";
import { cleanupUsedNonces } from "./cleanup-nonces";
import { recheckPendingModeration } from "@/lib/moderation";

const PURGE_INTERVAL_MS = 60_000;
const TRANSCODE_INTERVAL_MS = 5_000;
const TX_POLL_INTERVAL_MS = 15_000;
const MODERATION_RECHECK_INTERVAL_MS = 120_000;
const NONCE_CLEANUP_INTERVAL_MS = 60 * 60_000; // 1h

let running = true;

async function tick() {
  try {
    const purged = await purgeStale();
    if (purged > 0) console.log(`[worker] purged ${purged} stale rows`);
  } catch (err) {
    console.error("[worker] purgeStale error", err);
  }

  try {
    const transcoded = await transcodePending();
    if (transcoded > 0) console.log(`[worker] transcoded ${transcoded} evidence items`);
  } catch (err) {
    console.error("[worker] transcodePending error", err);
  }

  try {
    const matched = await pollDeposits();
    if (matched > 0) console.log(`[worker] auto-confirmed ${matched} deposits`);
  } catch (err) {
    console.error("[worker] pollDeposits error", err);
  }

  try {
    const rechecked = await recheckPendingModeration();
    if (rechecked > 0) console.log(`[worker] re-screened ${rechecked} moderation reviews`);
  } catch (err) {
    console.error("[worker] recheckPendingModeration error", err);
  }

  try {
    const cleaned = await cleanupUsedNonces();
    if (cleaned > 0) console.log(`[worker] cleaned ${cleaned} expired nonces`);
  } catch (err) {
    console.error("[worker] cleanupUsedNonces error", err);
  }
}

async function main() {
  console.log("[worker] starting humaninterface worker");
  await tick();
  const purgeInterval = setInterval(async () => {
    try { await purgeStale(); } catch {}
  }, PURGE_INTERVAL_MS);
  const transcodeInterval = setInterval(async () => {
    try { await transcodePending(); } catch {}
  }, TRANSCODE_INTERVAL_MS);
  const txPollInterval = setInterval(async () => {
    try { await pollDeposits(); } catch {}
  }, TX_POLL_INTERVAL_MS);
  const moderationInterval = setInterval(async () => {
    try { await recheckPendingModeration(); } catch {}
  }, MODERATION_RECHECK_INTERVAL_MS);
  const nonceCleanupInterval = setInterval(async () => {
    try { await cleanupUsedNonces(); } catch {}
  }, NONCE_CLEANUP_INTERVAL_MS);

  const shutdown = (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down`);
    running = false;
    clearInterval(purgeInterval);
    clearInterval(transcodeInterval);
    clearInterval(txPollInterval);
    clearInterval(moderationInterval);
    clearInterval(nonceCleanupInterval);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (running) {
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
