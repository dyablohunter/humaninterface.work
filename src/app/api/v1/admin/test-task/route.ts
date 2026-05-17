import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/middleware";
import { checkSameOrigin } from "@/lib/auth/csrf";
import { ensureTestAiUser } from "@/lib/test-ai";
import { categoryEnum, countryCodeSchema, citySchema } from "@/lib/validation-tasks";

const schema = z.object({
  posterUsername: z.string().min(3).max(30).optional(), // defaults to test AI
  type: z.enum(["MICRO", "TASK", "JOB"]),
  title: z.string().min(3).max(140),
  description: z.string().min(3).max(20_000),
  category: categoryEnum,
  urgency: z.enum(["LOW", "NORMAL", "URGENT", "CRITICAL"]),
  privacy: z.enum(["PUBLIC", "PRIVATE"]),
  slotCount: z.number().int().min(1).max(20),
  estimatedMinutes: z.number().int().min(1).max(100_000),
  statedPriceUsdt: z.number().min(0.5).max(1_000_000),
  instantAcceptUsdt: z.number().min(0).max(1_000_000),
  minReputation: z.number().min(0).max(1).optional(),
  deadlineHours: z.number().min(0).max(24 * 365).optional(),
  status: z.enum(["OPEN", "PENDING_DEPOSIT"]).optional(),
  country: countryCodeSchema
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  city: citySchema
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * Admin testing endpoint: creates a Task directly via Prisma, bypassing
 * signature verification and the USDT escrow deposit flow. By default the
 * task is OPEN (funded=fake) so bids and lifecycle can be exercised without
 * a real on-chain transfer.
 */
export async function POST(req: NextRequest) {
  const csrf = checkSameOrigin(req);
  if (csrf) return csrf;
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  if (d.instantAcceptUsdt > d.statedPriceUsdt) {
    return NextResponse.json(
      { error: "instant_accept_above_stated" },
      { status: 400 },
    );
  }

  // Pick a poster: explicit AI username, or the configured test AI.
  let posterId: string;
  let posterUsername: string;
  if (d.posterUsername) {
    const u = await prisma.user.findUnique({ where: { username: d.posterUsername } });
    if (!u) return NextResponse.json({ error: "poster_not_found" }, { status: 404 });
    if (u.role !== "AI") {
      return NextResponse.json({ error: "poster_not_ai" }, { status: 400 });
    }
    posterId = u.id;
    posterUsername = u.username;
  } else {
    const t = await ensureTestAiUser();
    posterId = t.id;
    posterUsername = t.username;
  }

  const now = new Date();
  const status = d.status ?? "OPEN";
  const totalUsdt = d.statedPriceUsdt * d.slotCount * 1.05;
  const deadlineAt = d.deadlineHours
    ? new Date(now.getTime() + d.deadlineHours * 3_600_000)
    : null;
  const expiresAt = new Date(now.getTime() + 30 * 24 * 3_600_000); // 30d window for tests

  const created = await prisma.task.create({
    data: {
      posterId,
      type: d.type,
      title: d.title,
      description: d.description,
      category: d.category,
      urgency: d.urgency,
      privacy: d.privacy,
      slotCount: d.slotCount,
      estimatedMinutes: d.estimatedMinutes,
      statedPriceUsdt: new Prisma.Decimal(d.statedPriceUsdt.toFixed(6)),
      instantAcceptUsdt: new Prisma.Decimal(d.instantAcceptUsdt.toFixed(6)),
      minReputation: d.minReputation ?? null,
      country: d.country,
      city: d.country ? d.city : null,
      deadlineAt,
      totalUsdt: new Prisma.Decimal(totalUsdt.toFixed(6)),
      escrowTxSig: status === "OPEN" ? `test-${Date.now()}` : null,
      status,
      fundedAt: status === "OPEN" ? now : null,
      expiresAt,
      slots: {
        create: Array.from({ length: d.slotCount }, () => ({ status: "OPEN" as const })),
      },
    },
    select: { id: true, status: true, slotCount: true },
  });

  return NextResponse.json({
    ok: true,
    taskId: created.id,
    status: created.status,
    slotCount: created.slotCount,
    posterUsername,
  });
}
