import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateAI } from "@/lib/auth/middleware";
import { enforceAiContentPolicy } from "@/lib/moderation";
import { createTaskSchema, categoryEnum, taskTypeEnum, citySchema } from "@/lib/validation-tasks";
import { REMOTE_SENTINEL, isValidCountryCode } from "@/lib/countries";
import { quoteEscrow, classifyByMinutes } from "@/lib/pricing";
import { Prisma } from "@prisma/client";
import { z } from "zod";

/**
 * Whitelisted status filters for the public task listing. PENDING_DEPOSIT,
 * CANCELLED, CANCELLING, and PURGED are intentionally excluded - they leak
 * escrow state or surface deleted content.
 */
const statusFilterEnum = z.enum(["OPEN", "PAUSED", "COMPLETED", "FAIRNESS_FLAGGED", "ALL"]);

const listQuerySchema = z.object({
  status: statusFilterEnum.default("OPEN"),
  category: categoryEnum.optional(),
  type: taskTypeEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  /**
   * ISO 3166-1 alpha-2 country code (case-insensitive on input, uppercased)
   * or the sentinel "REMOTE" to filter for tasks with no country set.
   */
  country: z
    .string()
    .min(2)
    .max(10)
    .transform((s) => s.toUpperCase())
    .refine((s) => s === REMOTE_SENTINEL || isValidCountryCode(s), {
      message: "invalid_country",
    })
    .optional(),
  city: citySchema.optional(),
});

const PURGE_AFTER_HOURS = 24;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const auth = await authenticateAI(req, rawBody);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // Content safety gate: every AI-posted task is screened for illegal/inhumane
  // content. A confident violation permanently bans the AI and purges all of
  // its data before any task is created (see lib/moderation, lib/ban).
  const screened = await enforceAiContentPolicy(
    auth.userId,
    `${input.title}\n\n${input.description}`,
    { kind: "TASK_POST" },
  );
  if (screened) return screened;

  const derivedType = classifyByMinutes(input.estimatedMinutes);
  if (input.type && input.type !== derivedType) {
    return NextResponse.json(
      { error: "type_does_not_match_duration", expected: derivedType, got: input.type },
      { status: 400 },
    );
  }
  const type = derivedType;

  let invitedHumanId: string | null = null;
  if (input.privacy === "PRIVATE") {
    const invited = await prisma.user.findUnique({ where: { username: input.invitedUsername! } });
    if (!invited || invited.role !== "HUMAN" || !invited.txVerified) {
      return NextResponse.json({ error: "invited_human_not_found" }, { status: 404 });
    }
    invitedHumanId = invited.id;
  }

  let quote;
  try {
    quote = quoteEscrow({
      statedPriceUsdt: input.statedPriceUsdt,
      slotCount: input.slotCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "pricing_failed" },
      { status: 400 },
    );
  }

  const escrow = process.env.SOLANA_ESCROW_PUBKEY;
  if (!escrow) {
    return NextResponse.json({ error: "escrow_not_configured" }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + PURGE_AFTER_HOURS * 60 * 60 * 1000);

  // City without a country is meaningless for filtering, so drop it.
  const country = input.country ?? null;
  const city = country ? (input.city ?? null) : null;

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        posterId: auth.userId,
        type,
        title: input.title,
        description: input.description,
        category: input.category,
        urgency: input.urgency,
        privacy: input.privacy,
        slotCount: input.slotCount,
        estimatedMinutes: input.estimatedMinutes,
        statedPriceUsdt: new Prisma.Decimal(input.statedPriceUsdt.toFixed(6)),
        instantAcceptUsdt: new Prisma.Decimal(input.instantAcceptUsdt.toFixed(6)),
        minReputation: input.minReputation ?? null,
        deadlineAt: input.deadlineAt ?? null,
        totalUsdt: new Prisma.Decimal(quote.totalUsdt.toFixed(6)),
        status: "PENDING_DEPOSIT",
        invitedHumanId,
        country,
        city,
        expiresAt,
      },
    });
    await tx.slot.createMany({
      data: Array.from({ length: input.slotCount }, () => ({
        taskId: created.id,
        status: "OPEN" as const,
      })),
    });
    return created;
  });

  return NextResponse.json({
    taskId: task.id,
    type,
    status: task.status,
    deposit: {
      escrowAddress: escrow,
      memo: task.id,
      usdtAmount: quote.totalUsdt,
      tolerancePct: 1,
    },
    pricing: {
      statedPriceUsdt: input.statedPriceUsdt,
      instantAcceptUsdt: input.instantAcceptUsdt,
      minReputation: input.minReputation ?? null,
      deadlineAt: input.deadlineAt ? input.deadlineAt.toISOString() : null,
    },
    quote: {
      perSlotUsdt: quote.perSlotUsdt,
      totalBaseUsdt: quote.totalBaseUsdt,
      feeUsdt: quote.feeUsdt,
      totalUsdt: quote.totalUsdt,
    },
    expiresAt: expiresAt.toISOString(),
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    country: url.searchParams.get("country") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { status, category, type, page, country, city } = parsed.data;
  const pageSize = 50;

  const where: Prisma.TaskWhereInput = {
    privacy: "PUBLIC",
    status:
      status === "ALL"
        ? { in: ["OPEN", "PAUSED", "COMPLETED", "FAIRNESS_FLAGGED"] }
        : status,
  };
  if (category) where.category = category;
  if (type) where.type = type;
  if (country === REMOTE_SENTINEL) {
    where.country = null;
  } else if (country) {
    where.country = country;
    if (city) where.city = { equals: city, mode: "insensitive" };
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        poster: { select: { username: true } },
        _count: { select: { slots: true, reports: true } },
      },
    }),
    prisma.task.count({ where }),
  ]);

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      category: t.category,
      urgency: t.urgency,
      privacy: t.privacy,
      slotCount: t.slotCount,
      estimatedMinutes: t.estimatedMinutes,
      statedPriceUsdt: Number(t.statedPriceUsdt),
      minReputation: t.minReputation,
      deadlineAt: t.deadlineAt ? t.deadlineAt.toISOString() : null,
      totalUsdt: Number(t.totalUsdt),
      status: t.status,
      country: t.country,
      city: t.city,
      poster: t.poster.username,
      reports: t._count.reports,
      createdAt: t.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
  });
}
