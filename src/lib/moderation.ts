import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { banAndBlockAi } from "@/lib/ban";
import type { ModerationKind } from "@prisma/client";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_INPUT_CHARS = 20_000;
const MAX_AUTO_ATTEMPTS = 6; // after this many failed re-checks → MANUAL (admin)

export interface ModerationVerdict {
  /** true = content is allowed. */
  ok: boolean;
  /** true = content was confidently classified as prohibited. */
  violation: boolean;
  /** short classifier label, e.g. "violence", "csam", "weapons", "none". */
  category: string;
  /** one-sentence explanation. */
  reason: string;
  /** true if the check could not be completed (we then fail OPEN - never ban). */
  errored: boolean;
}

const CLEAN: ModerationVerdict = {
  ok: true,
  violation: false,
  category: "none",
  reason: "",
  errored: false,
};

const SYSTEM_PROMPT = `You are a strict content-safety classifier for a marketplace where AI agents hire humans to perform real-world tasks. Decide whether the task text solicits, describes, plans, or facilitates activity that is criminal in most jurisdictions worldwide OR that the overwhelming majority of humanity considers inhumane.

Treat as a VIOLATION (non-exhaustive): violence, assault, murder, torture, or contracted harm against people or animals; terrorism; weapons capable of mass casualties; explosives, biological, chemical, or nuclear weapons; sexual content involving minors (CSAM) or any child sexual exploitation; human trafficking, slavery, forced labour, or kidnapping; sexual exploitation or non-consensual sexual acts; manufacture or trafficking of illegal drugs or weapons; financial fraud, money laundering, sanctions evasion, large-scale theft; unauthorized intrusion, malware, ransomware, or large-scale hacking; doxxing, stalking, or targeted harassment of identifiable people; helping evade law enforcement for a serious crime.

Ordinary lawful work is ALLOWED even if mundane, physical, unusual, adult-but-legal, or emotionally heavy (deliveries, repairs, trades, caregiving, creative, professional, fieldwork, data tasks, lawful security work).

Be decisive. Never refuse. Respond with ONLY a compact JSON object and nothing else:
{"violation": boolean, "category": string, "reason": string}
"category" is a short snake_case label (e.g. "violence", "csam", "trafficking", "weapons", "fraud", "drugs", "cybercrime", "harassment", "none"). "reason" is one sentence.`;

/**
 * Classifies AI-submitted free text with DeepSeek. Fails OPEN on any error,
 * missing key, or unparseable response - a ban is permanent, so we only act on
 * a confident positive; everything else is allowed and (when it errored)
 * queued for an automatic re-check.
 */
export async function screenAiContent(text: string): Promise<ModerationVerdict> {
  const key = process.env.DEEPSEEK_API_KEY;
  const trimmed = (text ?? "").trim();
  if (!trimmed) return CLEAN;
  if (!key) {
    console.error("[moderation] DEEPSEEK_API_KEY not configured - failing open");
    return { ...CLEAN, errored: true, reason: "moderation_not_configured" };
  }

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed.slice(0, MAX_INPUT_CHARS) },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("[moderation] deepseek http", res.status);
      return { ...CLEAN, errored: true, reason: `moderation_http_${res.status}` };
    }

    const data: unknown = await res.json();
    const content = extractContent(data);
    const verdict = parseVerdict(content);
    if (!verdict) {
      console.error("[moderation] unparseable verdict:", content?.slice(0, 200));
      return { ...CLEAN, errored: true, reason: "moderation_unparseable" };
    }

    const violation = verdict.violation === true;
    return {
      ok: !violation,
      violation,
      category: String(verdict.category || (violation ? "unspecified" : "none")).slice(0, 64),
      reason: String(verdict.reason || "").slice(0, 500),
      errored: false,
    };
  } catch (err) {
    console.error("[moderation] deepseek error", err);
    return { ...CLEAN, errored: true, reason: "moderation_unavailable" };
  }
}

function extractContent(data: unknown): string {
  const choices = (data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  const c = choices?.[0]?.message?.content;
  return typeof c === "string" ? c : "";
}

function parseVerdict(
  content: string,
): { violation?: boolean; category?: string; reason?: string } | null {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

interface ScreenContext {
  kind: ModerationKind;
  targetId?: string | null;
}

/**
 * Screens AI-submitted content. Outcomes:
 *  - clean → returns null, request proceeds.
 *  - violation → permanently bans + blocklists the account (posts & funds
 *    kept) and returns the 451 the caller MUST return.
 *  - classifier errored → the request is ALLOWED (returns null) but the exact
 *    text is queued in ModerationReview for an automatic re-check; the admin
 *    dashboard surfaces anything still pending.
 */
export async function enforceAiContentPolicy(
  userId: string,
  text: string,
  ctx: ScreenContext,
): Promise<NextResponse | null> {
  const verdict = await screenAiContent(text);

  if (verdict.violation) {
    try {
      await banAndBlockAi(userId, {
        reason: "prohibited_content",
        category: verdict.category,
        detail: verdict.reason,
      });
    } catch (err) {
      console.error("[moderation] ban failed", err);
    }
    return NextResponse.json(
      {
        error: "content_rejected_account_banned",
        message:
          "The submitted content was classified as describing or soliciting illegal or inhumane activity. This account and its username have been permanently banned and blocklisted. This decision is final.",
        category: verdict.category,
        reason: verdict.reason,
      },
      { status: 451 },
    );
  }

  if (verdict.errored) {
    // Fail open, but record it so the worker re-checks and the admin sees it.
    try {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { solanaPubkey: true, username: true },
      });
      if (u) {
        await prisma.moderationReview.create({
          data: {
            userId,
            pubkey: u.solanaPubkey,
            username: u.username,
            kind: ctx.kind,
            targetId: ctx.targetId ?? null,
            content: text.slice(0, MAX_INPUT_CHARS),
            lastError: verdict.reason,
          },
        });
      }
    } catch (err) {
      console.error("[moderation] failed to enqueue review", err);
    }
  }

  return null;
}

/**
 * Screens HUMAN-submitted free text (messages, text evidence, petitions).
 * Humans are paid labour, not AI principals - a confident violation does NOT
 * permanently blocklist the identity (that is the AI-poster ToS mechanism).
 * Instead the account is suspended (reversible by an admin), the offending
 * text is recorded as ACTIONED in the review queue, and the request is
 * rejected with 451. A classifier error fails OPEN and is queued for re-check.
 */
export async function enforceHumanContentPolicy(
  userId: string,
  text: string,
  ctx: ScreenContext,
): Promise<NextResponse | null> {
  const verdict = await screenAiContent(text);

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { solanaPubkey: true, username: true },
  });

  if (verdict.violation) {
    try {
      await prisma.user.update({ where: { id: userId }, data: { suspended: true } });
      if (u) {
        await prisma.moderationReview.create({
          data: {
            userId,
            pubkey: u.solanaPubkey,
            username: u.username,
            kind: ctx.kind,
            targetId: ctx.targetId ?? null,
            content: text.slice(0, MAX_INPUT_CHARS),
            status: "ACTIONED",
            category: verdict.category,
            detail: verdict.reason,
          },
        });
      }
    } catch (err) {
      console.error("[moderation] human violation handling failed", err);
    }
    return NextResponse.json(
      {
        error: "content_rejected_account_suspended",
        message:
          "The submitted content was classified as describing or soliciting illegal or inhumane activity. This account has been suspended pending admin review.",
        category: verdict.category,
        reason: verdict.reason,
      },
      { status: 451 },
    );
  }

  if (verdict.errored && u) {
    try {
      await prisma.moderationReview.create({
        data: {
          userId,
          pubkey: u.solanaPubkey,
          username: u.username,
          kind: ctx.kind,
          targetId: ctx.targetId ?? null,
          content: text.slice(0, MAX_INPUT_CHARS),
          lastError: verdict.reason,
        },
      });
    } catch (err) {
      console.error("[moderation] failed to enqueue human review", err);
    }
  }

  return null;
}

/**
 * Queues image/video evidence for manual admin review. DeepSeek (deepseek-chat)
 * is text-only and cannot inspect media, so these go straight to MANUAL - the
 * submission is allowed through; an admin must eyeball the files.
 */
export async function queueEvidenceMediaForReview(
  userId: string,
  evidenceId: string,
  note: string,
): Promise<void> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { solanaPubkey: true, username: true },
    });
    if (!u) return;
    await prisma.moderationReview.create({
      data: {
        userId,
        pubkey: u.solanaPubkey,
        username: u.username,
        kind: "EVIDENCE_MEDIA",
        targetId: evidenceId,
        content: note.slice(0, MAX_INPUT_CHARS),
        status: "MANUAL",
      },
    });
  } catch (err) {
    console.error("[moderation] failed to queue media review", err);
  }
}

/**
 * Worker pass: re-screen everything still PENDING. A clean re-check clears it;
 * a violation bans the account; another error bumps the attempt count until
 * MAX_AUTO_ATTEMPTS, after which it is escalated to MANUAL for the admin.
 * Returns the number of rows whose status changed.
 */
export async function recheckPendingModeration(): Promise<number> {
  const pending = await prisma.moderationReview.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  let changed = 0;
  for (const row of pending) {
    const verdict = await screenAiContent(row.content);

    if (verdict.violation) {
      try {
        if (row.userId) {
          const ru = await prisma.user.findUnique({
            where: { id: row.userId },
            select: { role: true },
          });
          if (ru?.role === "AI") {
            // AI poster - permanent ToS blocklist (posts & funds kept).
            await banAndBlockAi(row.userId, {
              reason: "prohibited_content",
              category: verdict.category,
              detail: verdict.reason,
            });
          } else {
            // Human - suspend only (reversible by admin).
            await prisma.user.update({
              where: { id: row.userId },
              data: { suspended: true },
            });
          }
        }
      } catch (err) {
        console.error("[moderation] recheck enforcement failed", row.id, err);
      }
      await prisma.moderationReview.update({
        where: { id: row.id },
        data: {
          status: "ACTIONED",
          attempts: { increment: 1 },
          category: verdict.category,
          detail: verdict.reason,
        },
      });
      changed++;
      continue;
    }

    if (verdict.errored) {
      const attempts = row.attempts + 1;
      await prisma.moderationReview.update({
        where: { id: row.id },
        data: {
          attempts,
          lastError: verdict.reason,
          status: attempts >= MAX_AUTO_ATTEMPTS ? "MANUAL" : "PENDING",
        },
      });
      if (attempts >= MAX_AUTO_ATTEMPTS) changed++;
      continue;
    }

    // Clean.
    await prisma.moderationReview.update({
      where: { id: row.id },
      data: { status: "CLEARED", attempts: { increment: 1 }, category: "none" },
    });
    changed++;
  }

  return changed;
}
