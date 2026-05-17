import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { categoryEnum, countryCodeSchema, citySchema } from "@/lib/validation-tasks";

/**
 * Admin hard-delete for a Task. Cascades through Prisma's relation rules to
 * Slot, Bid, Application, Milestone, Report, Message. TokenTxLog and AuditLog
 * are deliberately kept (no FK relation; they're audit history that should
 * outlive the row).
 *
 * Intentionally destructive - there is no soft-delete equivalent on Task.
 * Admin only.
 */
/**
 * Admin task patch — for the Testing tab "Edit task" panel. Edits safe
 * fields only: free-text + classification + location + bidding window +
 * reputation gate + admin status override. Does NOT touch slot count,
 * pricing, escrow, or poster — those would require state migrations
 * (slot creation/deletion, re-escrow) we don't do here.
 */
const patchSchema = z.object({
  title: z.string().min(3).max(140).optional(),
  description: z.string().min(3).max(20_000).optional(),
  category: categoryEnum.optional(),
  urgency: z.enum(["LOW", "NORMAL", "URGENT", "CRITICAL"]).optional(),
  privacy: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  minReputation: z.number().min(0).max(1).nullable().optional(),
  deadlineAt: z.number().int().min(0).nullable().optional(),
  biddingHours: z.number().int().refine((n) => n === 24 || n === 48, { message: "must_be_24_or_48" }).optional(),
  status: z.enum(["OPEN", "PAUSED", "PENDING_DEPOSIT", "FAIRNESS_FLAGGED"]).optional(),
  country: countryCodeSchema.nullable().optional(),
  city: citySchema.nullable().optional(),
  // Note: no transform on these — we need to distinguish "key absent"
  // (undefined → don't touch) from "explicit null" (clear the field).
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).refine(
  (v) => {
    // Pair rule applies when at least one of the coord keys is present in
    // the patch body. If both are absent (undefined), the patch isn't
    // touching coords; pass through. Otherwise both must resolve to either
    // numbers or both to null.
    const latPresent = v.latitude !== undefined;
    const lngPresent = v.longitude !== undefined;
    if (!latPresent && !lngPresent) return true;
    if (latPresent !== lngPresent) return false;
    const latNull = v.latitude === null;
    const lngNull = v.longitude === null;
    return latNull === lngNull;
  },
  { message: "latitude_and_longitude_must_be_paired", path: ["longitude"] },
);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const existing = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      fundedAt: true,
      biddingHours: true,
      biddingClosesAt: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "task_not_found" }, { status: 404 });
  }

  // City without a country is meaningless — clear city if country is being cleared.
  const data: Prisma.TaskUpdateInput = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description;
  if (d.category !== undefined) data.category = d.category;
  if (d.urgency !== undefined) data.urgency = d.urgency;
  if (d.privacy !== undefined) data.privacy = d.privacy;
  if (d.minReputation !== undefined) data.minReputation = d.minReputation;
  if (d.deadlineAt !== undefined) {
    data.deadlineAt = d.deadlineAt === null ? null : new Date(d.deadlineAt);
  }
  if (d.status !== undefined) data.status = d.status;
  if (d.country !== undefined) data.country = d.country;
  if (d.city !== undefined) data.city = d.city;
  // If country was cleared in this patch, city must follow.
  if (d.country === null) data.city = null;
  if (d.latitude !== undefined) data.latitude = d.latitude;
  if (d.longitude !== undefined) data.longitude = d.longitude;

  // Bidding window: changing biddingHours recomputes biddingClosesAt from
  // fundedAt. If the task isn't funded yet, biddingClosesAt stays null.
  if (d.biddingHours !== undefined) {
    data.biddingHours = d.biddingHours;
    if (existing.fundedAt) {
      data.biddingClosesAt = new Date(existing.fundedAt.getTime() + d.biddingHours * 3_600_000);
    }
  }

  try {
    const updated = await prisma.task.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        status: true,
        biddingHours: true,
        biddingClosesAt: true,
      },
    });
    return NextResponse.json({
      ok: true,
      task: {
        ...updated,
        biddingClosesAt: updated.biddingClosesAt?.getTime() ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "update_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const before = await prisma.task.findUnique({
      where: { id },
      select: { id: true, title: true, status: true, posterId: true },
    });
    if (!before) {
      return NextResponse.json({ error: "task_not_found" }, { status: 404 });
    }
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: before });
  } catch (err) {
    return NextResponse.json(
      { error: "delete_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
