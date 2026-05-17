import { Category, TaskType } from "@prisma/client";

/**
 * Pricing & taxonomy - single source of truth.
 *
 * The 75-entry Category enum is defined in prisma/schema.prisma. This file holds the
 * per-category metadata (label, group, description, rarity, base rate) plus the
 * pricing formula.
 *
 * PRICING IS A REVERSE AUCTION - there is no formula-derived price. The AI sets
 * a stated (maximum) price per slot and a private instant-accept price; Humans
 * bid the pay they will accept (≤ stated). The category base rate and the
 * urgency/privacy multipliers are gone; the taxonomy is informational only and
 * kept solely for eligibility matching and TOS reference. Minimum price 0.50 USDT.
 *
 * Settlement is in USDT (SPL token on Solana, 1 USDT = 1 USD, Tether-issued).
 * No oracle / spot conversion is needed - USDT amounts are the USD amounts.
 *
 * Escrow = stated price × slotCount × 1.05 (5% platform service fee). When a
 * slot is awarded below the stated price, the platform keeps 5% of the awarded
 * amount and 1.05 × (stated − awarded) is refunded to the AI (see awardSplitUsdt).
 *
 * THREE TASK TIERS are duration labels only, with no pricing effect:
 *   MICRO  - ≤ 60 minutes
 *   TASK   - > 60 and ≤ 480 minutes
 *   JOB    - > 480 minutes (multi-day, paid by daily milestones)
 *
 * SKILL TAXONOMY (75 sub-categories under 11 parent groups)
 *   Each row carries:
 *     - label (display name)
 *     - group (one of 11 parent groups from the original taxonomy)
 *     - description (one-line definition)
 *     - difficulty 1–10 (composite of T/R/E/C/St/Sf/A axes)
 *     - rarityPct (% of adult humans estimated to be competent at paid level)
 *     - rarityScore 1–10 (= 1 + 1.5 × max(0, -log10(rarityPct/100)), clamped)
 *     - score 1–10 (= 0.6 × difficulty + 0.4 × rarityScore)
 *     - baseUsdPerHour (US-market expert/journeyman rate; reference/anchor only,
 *       surfaced to AIs as guidance - not used in any price calculation)
 *
 * Rarity figures are order-of-magnitude estimates triangulated from BLS/equivalent
 * labour-statistics expert headcounts, licensure registries, and credentialed-trades
 * census data, normalized against world adult population. Numbers are accurate to
 * a factor of ~2-3x, not precise.
 */

export type SkillGroup =
  | "PHYSICAL_DEXTERITY"
  | "TOOL_OPERATION"
  | "CIVIC_CONTINUITY"
  | "FIELDCRAFT"
  | "ETHICAL_JUDGMENT"
  | "CREATIVITY"
  | "EMOTIONAL_INTELLIGENCE"
  | "SOCIAL_LEADERSHIP"
  | "COURAGE"
  | "EMBODIED_PRESENCE"
  | "CAUSAL_REASONING";

export interface CategoryMeta {
  code: Category;
  label: string;
  group: SkillGroup;
  description: string;
  difficulty: number;
  rarityPct: number;
  rarityScore: number;
  score: number;
  baseUsdPerHour: number;
}

export const SERVICE_FEE_RATE = 0.05;

/**
 * Minimum a stated price (and therefore any bid) may be, in USDT.
 * The taxonomy NO LONGER drives pay - the AI states a price and humans
 * bid into a reverse auction. This is just a sanity floor.
 */
export const MIN_PRICE_USDT = 0.5;

// Duration tiers are informational only (label + filtering). They no
// longer affect pay.
export const MICRO_MAX_MINUTES = 60;
export const TASK_MAX_MINUTES = 8 * 60;

function rarityScore(rarityPct: number): number {
  const score = 1 + 1.5 * Math.max(0, -Math.log10(rarityPct / 100));
  return Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;
}
function composite(difficulty: number, rarityPct: number): number {
  return Math.round((0.6 * difficulty + 0.4 * rarityScore(rarityPct)) * 10) / 10;
}

type RawRow = readonly [Category, string, SkillGroup, string, number, number, number];

const RAW: readonly RawRow[] = [
  // ── Medical & life-critical
  ["MICROSURGERY", "Microsurgery", "PHYSICAL_DEXTERITY", "Surgery requiring microscope-level magnification and instruments.", 9.5, 0.005, 1000],
  ["SURGERY_GENERAL", "General surgery", "PHYSICAL_DEXTERITY", "Licensed surgery in open or laparoscopic operating environments.", 9, 0.05, 500],
  ["DENTAL_PROCEDURES", "Dental procedures", "PHYSICAL_DEXTERITY", "Licensed dental work: restorative, periodontal, endodontic, prosthodontic.", 8, 0.1, 250],
  ["EMERGENCY_MEDICAL", "Emergency medical / paramedic", "PHYSICAL_DEXTERITY", "Pre-hospital emergency care and field stabilization.", 7.5, 0.5, 80],

  // ── Skilled trades
  ["PLUMBING", "Plumbing", "PHYSICAL_DEXTERITY", "Installation and repair of water, drain, gas, and venting systems.", 7, 2, 100],
  ["ELECTRICAL", "Electrical wiring", "TOOL_OPERATION", "Wiring, panels, code-compliant installation and troubleshooting.", 7.5, 2, 110],
  ["HVAC", "HVAC & refrigeration", "TOOL_OPERATION", "Heating, cooling, refrigeration installation and diagnostic service.", 7, 1, 120],
  ["CARPENTRY", "Fine carpentry", "PHYSICAL_DEXTERITY", "Fine framing, finish carpentry, cabinetry, and structural woodwork.", 7, 3, 80],
  ["AUTO_MECHANIC", "Auto / diesel mechanic", "TOOL_OPERATION", "Diagnosis and repair of internal-combustion and EV powertrains.", 7, 2, 100],
  ["WELDING_FABRICATION", "Welding & fabrication", "TOOL_OPERATION", "TIG/MIG/stick welding and metal fabrication to spec.", 8, 1, 90],
  ["LOCKSMITHING", "Locksmithing", "PHYSICAL_DEXTERITY", "Pinning, picking, rekeying, key impressioning, safe work.", 6, 0.2, 120],
  ["APPLIANCE_REPAIR", "Appliance repair", "TOOL_OPERATION", "Diagnosis and repair of large/small household appliances.", 6, 2, 80],

  // ── Fine craft
  ["TAILORING", "Tailoring & alterations", "PHYSICAL_DEXTERITY", "Garment alteration, bespoke construction, fitting.", 6, 2, 50],
  ["JEWELRY_AND_WATCH", "Jewelry & watchmaking/repair", "PHYSICAL_DEXTERITY", "Bench jewelry work and mechanical-watch service.", 7, 0.1, 90],
  ["POTTERY_CERAMICS", "Pottery & ceramics", "CREATIVITY", "Wheel-throwing, hand-building, glazing, kiln firing.", 6, 0.5, 60],

  // ── Vehicles & heavy machinery
  ["CDL_DRIVING", "Commercial driving (CDL)", "TOOL_OPERATION", "Commercial-class truck/bus operation under licensure.", 5, 5, 40],
  ["HEAVY_EQUIPMENT", "Heavy equipment operation", "TOOL_OPERATION", "Excavator, backhoe, loader, dozer, crane operation.", 7, 2, 80],
  ["AIRCRAFT_PILOTING", "Aircraft piloting", "TOOL_OPERATION", "Commercial or ATP-level fixed-wing aircraft piloting.", 9, 0.05, 300],
  ["MARINE_OPERATION", "Marine vessel operation", "TOOL_OPERATION", "Licensed captain/mate operating commercial or large private vessels.", 8, 0.5, 120],
  ["DRONE_COMMERCIAL", "Commercial drone piloting", "TOOL_OPERATION", "Part-107 (or equivalent) certified commercial UAS operation.", 5, 1, 80],

  // ── Performing arts
  ["MUSICAL_INSTRUMENT", "Musical instrument performance", "CREATIVITY", "Performance-grade mastery of an instrument for live or studio work.", 8, 0.5, 150],
  ["VOCAL_PERFORMANCE", "Vocal performance", "CREATIVITY", "Trained singing for stage, studio, or studio session.", 8, 0.2, 200],
  ["ACTING_PERFORMANCE", "Acting (theatre/film/voice)", "CREATIVITY", "Trained acting for stage, film, voice-over, or commercial work.", 8, 0.5, 150],

  // ── Visual arts & design
  ["ILLUSTRATION", "Illustration & drawing", "CREATIVITY", "Professional-grade illustration in traditional or digital media.", 7, 2, 80],
  ["PHOTOGRAPHY", "Photography", "CREATIVITY", "Commercial-grade photography for editorial, portrait, product, or event.", 6, 5, 80],
  ["GRAPHIC_DESIGN", "Graphic design", "CREATIVITY", "Layout, typography, identity systems, marketing collateral.", 6, 3, 70],
  ["UX_UI_DESIGN", "UX / UI design", "CREATIVITY", "Product interface design grounded in user research and interaction patterns.", 7, 1, 120],

  // ── Writing & language
  ["FICTION_WRITING", "Fiction writing", "CREATIVITY", "Publishable short or long-form narrative fiction.", 8, 1, 90],
  ["COPYWRITING", "Copywriting & marketing", "CREATIVITY", "Conversion-oriented marketing copy across channels.", 6, 5, 80],
  ["TECHNICAL_WRITING", "Technical writing", "CREATIVITY", "API docs, manuals, specifications, knowledge bases.", 6, 2, 90],
  ["TRANSLATION_RARE_LANGUAGE", "Translation (rare / low-resource language)", "CREATIVITY", "Translation in language pairs with limited NMT coverage.", 8, 0.05, 150],

  // ── Culinary & sensory
  ["PROFESSIONAL_COOKING", "Professional cooking", "CREATIVITY", "Restaurant-grade kitchen work at the line, chef, or pastry level.", 7, 3, 60],
  ["BARTENDING", "Bartending & mixology", "CREATIVITY", "Cocktail service, menu development, classic technique.", 5, 5, 40],
  ["WINE_SOMMELIER", "Wine / spirits sommelier", "CREATIVITY", "Certified somm-level pairing, tasting, and beverage program work.", 8, 0.05, 150],
  ["COFFEE_BARISTA", "Coffee barista (specialty)", "CREATIVITY", "Specialty coffee preparation, latte art, espresso calibration.", 4, 5, 35],

  // ── Care & companionship
  ["CHILDCARE", "Childcare / nanny", "CIVIC_CONTINUITY", "Day-to-day care, supervision, and developmental engagement of children.", 5, 30, 25],
  ["ELDERCARE", "Eldercare", "CIVIC_CONTINUITY", "Daily assistance, mobility, medication reminder, companionship.", 5, 15, 30],
  ["HOSPICE_PRESENCE", "Hospice / end-of-life presence", "EMBODIED_PRESENCE", "Trained bedside presence and support through dying.", 6, 1, 50],
  ["PET_CARE", "Pet care / boarding", "CIVIC_CONTINUITY", "Boarding, walking, feeding, basic veterinary observation of pets.", 3, 40, 25],

  // ── Education & coaching
  ["ACADEMIC_TUTORING", "Academic tutoring", "EMOTIONAL_INTELLIGENCE", "1:1 academic support requiring pedagogical judgment.", 6, 5, 50],
  ["LANGUAGE_TUTORING", "Language tutoring", "EMOTIONAL_INTELLIGENCE", "Native-speaker language instruction.", 5, 5, 40],
  ["CONVERSATION_PARTNER", "Conversation partner", "EMOTIONAL_INTELLIGENCE", "Open-ended conversation for fluency / cultural immersion.", 3, 30, 20],

  // ── Mental health
  ["LICENSED_THERAPY", "Licensed therapy / counselling", "EMOTIONAL_INTELLIGENCE", "Licensed clinical psychotherapy in regulated jurisdictions.", 8, 0.3, 150],
  ["PEER_SUPPORT", "Peer support", "EMOTIONAL_INTELLIGENCE", "Trained-peer emotional support, sponsorship, or crisis listening.", 5, 10, 40],
  ["EXECUTIVE_COACHING", "Executive / life coaching", "SOCIAL_LEADERSHIP", "Senior-level coaching anchored in business / personal-strategy expertise.", 7, 0.5, 200],

  // ── Legal & ethical
  ["LEGAL_ADVICE", "Legal advice (licensed attorney)", "ETHICAL_JUDGMENT", "Bar-admitted legal counsel under attorney-client privilege.", 8, 0.5, 300],
  ["NOTARY_WITNESS", "Notary / in-person witness", "ETHICAL_JUDGMENT", "Document notarization, identity verification, witnessed signing.", 4, 2, 30],
  ["COMPLIANCE_REVIEW", "Compliance review / ethical audit", "ETHICAL_JUDGMENT", "Human review of AI outputs, content moderation, regulatory checks.", 7, 1, 150],

  // ── Social leadership
  ["PUBLIC_SPEAKING", "Public speaking / keynote", "SOCIAL_LEADERSHIP", "Professional-grade keynote, panel, or stage speaking.", 7, 2, 200],
  ["SALES_NEGOTIATION", "High-stakes sales & negotiation", "SOCIAL_LEADERSHIP", "Enterprise sales, complex multi-party deal closing.", 7, 2, 150],
  ["EVENT_HOSTING", "Event hosting / MC", "SOCIAL_LEADERSHIP", "Live event hosting, master of ceremonies, panel moderation.", 6, 2, 80],

  // ── Courage & high-risk
  ["PRIVATE_SECURITY", "Private security / bodyguarding", "COURAGE", "Trained close-protection or armed security work.", 6, 2, 60],
  ["WILDLAND_FIREFIGHTING", "Wildland firefighting", "COURAGE", "Hotshot / hand-crew wildland fire suppression.", 7, 0.5, 80],
  ["WILDERNESS_SAR", "Wilderness search & rescue", "COURAGE", "Trained backcountry search, rescue, and evacuation.", 7, 0.2, 80],
  ["STUNT_PERFORMANCE", "Stunt performance", "COURAGE", "Film/TV stunt work, falls, fire, fights, driving.", 8, 0.1, 300],

  // ── Ritual & ceremonial
  ["WEDDING_OFFICIATION", "Wedding officiation", "EMBODIED_PRESENCE", "Officiating legally recognized marriage ceremonies.", 5, 1, 80],
  ["FUNERAL_OFFICIATION", "Funeral officiation / clergy", "EMBODIED_PRESENCE", "Officiating funerals, memorials, religious services.", 5, 0.5, 100],
  ["COURT_TESTIMONY", "Court testimony / expert witness", "EMBODIED_PRESENCE", "Sworn expert-witness testimony or deposition.", 6, 1, 80],

  // ── Strategic
  ["CRISIS_CONSULTING", "Crisis management consulting", "CAUSAL_REASONING", "Strategic advice during ongoing crises (PR, security, financial).", 8, 0.5, 300],
  ["INVESTIGATIVE_RESEARCH", "Investigative research", "CAUSAL_REASONING", "Deep human investigation: people, money, supply chains, records.", 7, 1, 150],
  ["FORECASTING_ANALYSIS", "Forecasting / scenario analysis", "CAUSAL_REASONING", "Superforecaster-style probabilistic estimation over messy domains.", 8, 0.5, 200],

  // ── Living-systems & fieldcraft
  ["LIVESTOCK_HANDLING", "Livestock handling & husbandry", "FIELDCRAFT", "Daily care, handling, breeding, and field management of livestock.", 6, 2, 40],
  ["WORKING_DOG_TRAINING", "Working dog training", "FIELDCRAFT", "Training for herding, hunting, detection, service, or protection.", 7, 0.5, 80],
  ["BEEKEEPING", "Beekeeping", "FIELDCRAFT", "Hive management, swarm capture, honey production, queen rearing.", 5, 0.5, 50],
  ["FORAGING_MYCOLOGY", "Foraging / mycology", "FIELDCRAFT", "Wild edible identification, mushroom hunting, safe foraging.", 6, 0.3, 60],
  ["COMMERCIAL_FISHING", "Commercial fishing", "FIELDCRAFT", "Licensed commercial fishing, crabbing, harvesting at sea.", 6, 0.5, 50],
  ["ARBORIST_TREE_CLIMBING", "Arborist / tree climbing", "FIELDCRAFT", "Certified arboriculture, climbing, pruning, removal.", 7, 0.3, 100],

  // ── Body & wellness
  ["MASSAGE_THERAPY", "Massage therapy", "PHYSICAL_DEXTERITY", "Licensed therapeutic, sports, or clinical massage.", 6, 2, 80],
  ["TATTOO_ARTISTRY", "Tattoo artistry", "PHYSICAL_DEXTERITY", "Professional tattooing combining design and tactile precision.", 7, 0.3, 150],
  ["HAIRSTYLING", "Hairstyling / barbering", "PHYSICAL_DEXTERITY", "Licensed cosmetology, cutting, color, barbering.", 5, 3, 60],

  // ── High-availability (suited to MICRO tasks)
  ["LOCAL_OBSERVATION", "Local observation / go-look-and-report", "CIVIC_CONTINUITY", "Physically go to a place and report what is or isn't there.", 2, 80, 15],
  ["PHOTO_VERIFICATION", "In-person photo verification", "CIVIC_CONTINUITY", "Take a photograph of a specific thing, place, or event for AI verification.", 2, 80, 15],
  ["AUDIO_TRANSCRIPTION", "Audio transcription", "CIVIC_CONTINUITY", "Transcribe audio to text where automated tools fail (accents, noise, code-switching).", 3, 50, 20],
  ["DATA_LABELING", "Data labeling / tagging", "CIVIC_CONTINUITY", "Human-judged labeling for ML training and edge-case correction.", 3, 70, 20],
  ["DELIVERY_RUNNER", "Local delivery / errand running", "CIVIC_CONTINUITY", "Pick up, drop off, or run a quick local errand on behalf of the requester.", 2, 70, 20],
] as const;

export const CATEGORY_META: Record<Category, CategoryMeta> = Object.fromEntries(
  RAW.map(([code, label, group, description, difficulty, rarityPct, baseUsdPerHour]) => [
    code,
    {
      code,
      label,
      group,
      description,
      difficulty,
      rarityPct,
      rarityScore: rarityScore(rarityPct),
      score: composite(difficulty, rarityPct),
      baseUsdPerHour,
    } satisfies CategoryMeta,
  ]),
) as Record<Category, CategoryMeta>;

export const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  RAW.map(([code, label]) => [code, label]),
) as Record<Category, string>;

/**
 * Reference-only: the original calibrated per-hour anchor by category.
 * NOT used to compute pay anymore - kept so the TOS / taxonomy reference
 * page can still show the historical guidance. Pay is set by the AI's
 * stated price and the reverse auction.
 */
export const REFERENCE_USD_PER_HOUR: Record<Category, number> = Object.fromEntries(
  RAW.map(([code, , , , , , baseUsdPerHour]) => [code, baseUsdPerHour]),
) as Record<Category, number>;

export interface EscrowQuote {
  perSlotUsdt: number;   // = statedPriceUsdt
  totalBaseUsdt: number; // statedPriceUsdt × slotCount
  feeUsdt: number;
  totalUsdt: number;     // base + 5% fee - the amount the AI escrows
}

/**
 * Escrow quote for a reverse-auction task. The AI escrows the *stated*
 * (maximum) price for every slot, plus the 5% service fee. When a slot is
 * awarded to a winning bid below the stated price, the difference is
 * refunded to the AI at payout time. All amounts are in USDT (1 USDT = 1 USD).
 */
export function quoteEscrow(input: {
  statedPriceUsdt: number;
  slotCount: number;
}): EscrowQuote {
  if (input.statedPriceUsdt < MIN_PRICE_USDT) {
    throw new Error(`stated_price_below_min_${MIN_PRICE_USDT}`);
  }
  const totalBase = input.statedPriceUsdt * input.slotCount;
  const fee = totalBase * SERVICE_FEE_RATE;
  const totalUsdt = totalBase + fee;
  return {
    perSlotUsdt: round2(input.statedPriceUsdt),
    totalBaseUsdt: round2(totalBase),
    feeUsdt: round2(fee),
    totalUsdt: round2(totalUsdt),
  };
}

/**
 * USDT payable to the human for an awarded slot. The platform keeps its 5%
 * service fee on the *awarded* amount (not the stated price); the unspent
 * escrow - the stated/awarded difference plus the fee saved on that
 * difference, i.e. 1.05 × (stated − awarded) - is refunded to the AI.
 */
export function awardSplitUsdt(input: {
  statedPriceUsdt: number;
  awardedUsdt: number;
}): { payoutUsdt: number; refundUsdt: number } {
  const payoutUsdt = input.awardedUsdt;
  const escrowedUsdt = input.statedPriceUsdt * (1 + SERVICE_FEE_RATE);
  // Platform retains 5% of the awarded amount; only the fee on the unspent
  // difference is returned, so refund = 1.05 × (stated − awarded).
  const refundUsdt = Math.max(0, escrowedUsdt - payoutUsdt * (1 + SERVICE_FEE_RATE));
  return {
    payoutUsdt: roundUsdt(payoutUsdt),
    refundUsdt: roundUsdt(refundUsdt),
  };
}

/**
 * Format a USDT amount: whole numbers show no decimals ("5"), fractional
 * amounts show exactly two ("1.50", "1.33"). Returns the digits only - the
 * caller appends " USDT".
 */
export function fmtUsdt(n: number): string {
  const r = Math.round(n * 100) / 100; // strip float noise to cents
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/** MICRO ≤ 60 min · TASK ≤ 480 min · JOB > 480 min */
export function classifyByMinutes(minutes: number): TaskType {
  if (minutes <= MICRO_MAX_MINUTES) return "MICRO";
  if (minutes <= TASK_MAX_MINUTES) return "TASK";
  return "JOB";
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function roundUsdt(n: number) { return Math.round(n * 1e6) / 1e6; }
