import { z } from "zod";
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

export const categoryEnum = z.enum([
  // Medical & life-critical
  "MICROSURGERY", "SURGERY_GENERAL", "DENTAL_PROCEDURES", "EMERGENCY_MEDICAL",
  // Skilled trades
  "PLUMBING", "ELECTRICAL", "HVAC", "CARPENTRY", "AUTO_MECHANIC", "WELDING_FABRICATION", "LOCKSMITHING", "APPLIANCE_REPAIR",
  // Fine craft
  "TAILORING", "JEWELRY_AND_WATCH", "POTTERY_CERAMICS",
  // Vehicles & heavy machinery
  "CDL_DRIVING", "HEAVY_EQUIPMENT", "AIRCRAFT_PILOTING", "MARINE_OPERATION", "DRONE_COMMERCIAL",
  // Performing arts
  "MUSICAL_INSTRUMENT", "VOCAL_PERFORMANCE", "ACTING_PERFORMANCE",
  // Visual arts & design
  "ILLUSTRATION", "PHOTOGRAPHY", "GRAPHIC_DESIGN", "UX_UI_DESIGN",
  // Writing & language
  "FICTION_WRITING", "COPYWRITING", "TECHNICAL_WRITING", "TRANSLATION_RARE_LANGUAGE",
  // Culinary & sensory
  "PROFESSIONAL_COOKING", "BARTENDING", "WINE_SOMMELIER", "COFFEE_BARISTA",
  // Care & companionship
  "CHILDCARE", "ELDERCARE", "HOSPICE_PRESENCE", "PET_CARE",
  // Education & coaching
  "ACADEMIC_TUTORING", "LANGUAGE_TUTORING", "CONVERSATION_PARTNER",
  // Mental health
  "LICENSED_THERAPY", "PEER_SUPPORT", "EXECUTIVE_COACHING",
  // Legal & ethical
  "LEGAL_ADVICE", "NOTARY_WITNESS", "COMPLIANCE_REVIEW",
  // Social leadership
  "PUBLIC_SPEAKING", "SALES_NEGOTIATION", "EVENT_HOSTING",
  // Courage & high-risk
  "PRIVATE_SECURITY", "WILDLAND_FIREFIGHTING", "WILDERNESS_SAR", "STUNT_PERFORMANCE",
  // Ritual & ceremonial
  "WEDDING_OFFICIATION", "FUNERAL_OFFICIATION", "COURT_TESTIMONY",
  // Strategic
  "CRISIS_CONSULTING", "INVESTIGATIVE_RESEARCH", "FORECASTING_ANALYSIS",
  // Living-systems & fieldcraft
  "LIVESTOCK_HANDLING", "WORKING_DOG_TRAINING", "BEEKEEPING", "FORAGING_MYCOLOGY", "COMMERCIAL_FISHING", "ARBORIST_TREE_CLIMBING",
  // Body & wellness
  "MASSAGE_THERAPY", "TATTOO_ARTISTRY", "HAIRSTYLING",
  // High-availability (micro-task)
  "LOCAL_OBSERVATION", "PHOTO_VERIFICATION", "AUDIO_TRANSCRIPTION", "DATA_LABELING", "DELIVERY_RUNNER",
]);

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
 *   deadlineAt         - optional deadline for the work itself (ISO 8601).
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
    deadlineAt: z.coerce.date().optional(),
    invitedUsername: usernameSchema.optional(),
    country: countryCodeSchema
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    city: citySchema
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
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
