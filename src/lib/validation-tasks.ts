import { z } from "zod";
import { Category } from "@prisma/client";
import { usernameSchema } from "./validation";
import { MIN_PRICE_USDT } from "./pricing";
import { isValidCountryCode } from "./countries";

/**
 * ISO 3166-1 alpha-2 country code. Accepts any-case input; normalises to
 * uppercase and rejects unknown codes. Empty/null/undefined → null
 * (= remote / location-agnostic).
 */
export const countryCodeSchema = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase())
  .refine(isValidCountryCode, { message: "unknown_country_code" });

/** Free-text city, trimmed, max 80 chars. Empty → null. */
export const citySchema = z.string().trim().min(1).max(80);

/**
 * Decimal-degree latitude/longitude. Both required together; the parent
 * schema's `.refine()` enforces the pair-or-null rule. Empty / undefined / null
 * normalise to null.
 */
export const latitudeSchema = z
  .number()
  .min(-90)
  .max(90)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

export const longitudeSchema = z
  .number()
  .min(-180)
  .max(180)
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/**
 * Helper for shared use by create/update endpoints: enforces the pair-or-null
 * rule on an object that already has `latitude` and `longitude` keys.
 */
export function coordinatesPaired(v: {
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  const latSet = v.latitude !== null && v.latitude !== undefined;
  const lngSet = v.longitude !== null && v.longitude !== undefined;
  return latSet === lngSet;
}

/**
 * Bound to the Prisma `Category` enum so it auto-stays in sync as new
 * categories are added to schema.prisma — no risk of validation drift.
 */
export const categoryEnum = z.nativeEnum(Category);

export const urgencyEnum = z.enum(["LOW", "NORMAL", "URGENT", "CRITICAL"]);
export const privacyEnum = z.enum(["PUBLIC", "PRIVATE"]);
export const taskTypeEnum = z.enum(["MICRO", "TASK", "JOB"]);

/**
 * Task creation payload (reverse-auction model).
 *
 *   estimatedMinutes  - canonical duration; only determines the tier label
 *                        (MICRO/TASK/JOB) and filtering. Does NOT affect pay.
 *   statedPriceUsdt    - the AI's maximum per-slot price (USDT). Escrowed upfront.
 *   instantAcceptUsdt  - any qualifying bid ≤ this is auto-accepted.
 *   minReputation      - optional eligibility gate, 0–1.
 *   deadlineAt         - optional deadline for the work itself (Unix ms).
 *   category           - taxonomy reference + eligibility gate (informational
 *                        for pay; humans must self-declare it to bid).
 */
export const createTaskSchema = z
  .object({
    type: taskTypeEnum.optional(), // server derives from estimatedMinutes if omitted
    title: z.string().min(3).max(200),
    description: z.string().min(10).max(20_000),
    category: categoryEnum,
    urgency: urgencyEnum,
    privacy: privacyEnum,
    slotCount: z.number().int().min(1).max(100),
    estimatedMinutes: z.number().int().min(1).max(60 * 24 * 90),
    statedPriceUsdt: z.number().min(MIN_PRICE_USDT).max(1_000_000),
    instantAcceptUsdt: z.number().min(MIN_PRICE_USDT).max(1_000_000),
    minReputation: z.number().min(0).max(1).optional(),
    /**
     * Reverse-auction bidding window length in hours. The AI chooses 24 or 48.
     * The clock starts at `fundedAt`; when it elapses, the worker auto-accepts
     * the lowest qualifying bid per still-OPEN slot.
     */
    biddingHours: z
      .number()
      .int()
      .refine((n) => n === 24 || n === 48, { message: "must_be_24_or_48" }),
    /**
     * Optional deadline as Unix milliseconds (number). Server converts to
     * Date before persisting. ISO 8601 strings are intentionally not accepted
     * here — every wire boundary in this API uses Unix ms.
     */
    deadlineAt: z
      .number()
      .int()
      .min(0)
      .optional()
      .transform((ms) => (ms === undefined ? undefined : new Date(ms))),
    invitedUsername: usernameSchema.optional(),
    country: countryCodeSchema
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    city: citySchema
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .refine(
    (v) => (v.privacy === "PRIVATE" ? !!v.invitedUsername : true),
    { message: "private_task_requires_invited_username", path: ["invitedUsername"] },
  )
  .refine((v) => v.instantAcceptUsdt <= v.statedPriceUsdt, {
    message: "instant_accept_must_be_<=_stated_price",
    path: ["instantAcceptUsdt"],
  })
  .refine((v) => !v.deadlineAt || v.deadlineAt.getTime() > Date.now(), {
    message: "deadline_must_be_in_the_future",
    path: ["deadlineAt"],
  })
  .refine(coordinatesPaired, {
    message: "latitude_and_longitude_must_be_paired",
    path: ["longitude"],
  });

export const createMilestoneSchema = z.object({
  hoursForDay: z.number().positive().max(24),
});

export const confirmDepositSchema = z.object({
  txSignature: z
    .string()
    .min(64)
    .max(120)
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/),
});

export const decisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(2000).optional(),
});

export const disputeSchema = z.object({
  reason: z.string().min(10).max(5000),
});

export const reportSchema = z.object({
  reason: z.string().max(2000).optional(),
});

export const submitTextSchema = z.object({
  text: z.string().max(50_000).optional(),
});

export const applySchema = z.object({
  message: z.string().min(1).max(5000),
});

export const decideApplicationSchema = z.object({
  accept: z.boolean(),
});

/** A human's reverse-auction bid: the per-slot pay (USDT) they will accept. */
export const bidSchema = z.object({
  amountUsdt: z.number().min(MIN_PRICE_USDT).max(1_000_000),
  message: z.string().max(5000).optional(),
});

/** AI decision on a pending (non-auto-accepted) bid. */
export const decideBidSchema = z.object({
  accept: z.boolean(),
});

/** A direct message in a (task, human) thread. */
export const messageSchema = z.object({
  body: z.string().min(1).max(4000),
  /** Required when the AI poster sends: picks which human thread. */
  humanUsername: usernameSchema.optional(),
});
