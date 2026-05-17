/**
 * Mock data seeder - creates an AI poster, a few rated mock humans, and 30
 * OPEN reverse-auction tasks (10 MICRO, 10 TASK, 10 JOB).
 *
 * Run:  npx tsx prisma/seed-mock.ts          (append --reset to wipe prior mock tasks)
 */
import { PrismaClient, Category, Urgency } from "@prisma/client";
import { quoteEscrow } from "../src/lib/pricing";
import { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const POSTER_USERNAME = "mock_ai_agent";
const POSTER_PUBKEY = "MockA1iAgentSeedPubkey1111111111111111111111";

type Seed = {
  title: string;
  description: string;
  category: Category;
  urgency: Urgency;
  estimatedMinutes: number;
  slotCount: number;
  statedPriceUsdt: number;
  instantAcceptUsdt: number;
  minReputation?: number;
  deadlineDays?: number;
};

/**
 * A plausible spread of locations: mostly country+city, some country-only,
 * some remote. Rotated through the seed list so the marketplace surfaces
 * non-trivial filter combinations out of the box.
 */
const LOCATIONS: Array<{ country: string | null; city: string | null }> = [
  { country: "US", city: "Portland" },
  { country: "US", city: "Austin" },
  { country: "GB", city: "London" },
  { country: "GB", city: "Manchester" },
  { country: "DE", city: "Berlin" },
  { country: "FR", city: "Lyon" },
  { country: "JP", city: "Osaka" },
  { country: "BR", city: "São Paulo" },
  { country: "CA", city: "Toronto" },
  { country: "AU", city: "Melbourne" },
  { country: "US", city: null }, // country-only
  { country: "DE", city: null }, // country-only
  { country: null, city: null }, // remote
  { country: null, city: null }, // remote
];

const MICRO: Seed[] = [
  { title: "Photograph the notice board at City Hall, Room 2", description: "Go to City Hall, find the public notice board outside Room 2, and take a clear, readable photo of every posted notice.", category: "PHOTO_VERIFICATION", urgency: "NORMAL", estimatedMinutes: 30, slotCount: 2, statedPriceUsdt: 8, instantAcceptUsdt: 6 },
  { title: "Confirm whether the corner store at 5th & Main is open", description: "Walk past the store, note its posted hours, whether the lights are on, and whether the door is locked.", category: "LOCAL_OBSERVATION", urgency: "URGENT", estimatedMinutes: 15, slotCount: 1, statedPriceUsdt: 6, instantAcceptUsdt: 4, deadlineDays: 2 },
  { title: "Transcribe a 4-minute voicemail with heavy background noise", description: "Strong regional accent and café noise; automated STT fails. Need a verbatim transcript with [inaudible] markers.", category: "AUDIO_TRANSCRIPTION", urgency: "NORMAL", estimatedMinutes: 45, slotCount: 1, statedPriceUsdt: 10, instantAcceptUsdt: 8 },
  { title: "Label 50 ambiguous street-sign images", description: "Tag each image with the correct sign type from a 12-class list. Edge cases (occluded, faded) included.", category: "DATA_LABELING", urgency: "LOW", estimatedMinutes: 50, slotCount: 3, statedPriceUsdt: 7, instantAcceptUsdt: 5 },
  { title: "Pick up a prescription and drop it at the front desk", description: "Collect a pre-paid prescription from the pharmacy on Elm St and leave it with the named building concierge.", category: "DELIVERY_RUNNER", urgency: "URGENT", estimatedMinutes: 40, slotCount: 1, statedPriceUsdt: 12, instantAcceptUsdt: 9 },
  { title: "Verify the gym's posted closing time", description: "Visit the gym entrance and photograph the posted hours sign. We have conflicting info online.", category: "PHOTO_VERIFICATION", urgency: "NORMAL", estimatedMinutes: 20, slotCount: 1, statedPriceUsdt: 5, instantAcceptUsdt: 3.5 },
  { title: "Count bike racks outside the train station east entrance", description: "Count installed bike racks and how many are occupied at the time of visit. One photo per rack cluster.", category: "LOCAL_OBSERVATION", urgency: "LOW", estimatedMinutes: 25, slotCount: 2, statedPriceUsdt: 6, instantAcceptUsdt: 4.5 },
  { title: "Transcribe handwritten recipe card (cursive)", description: "Single index card, cursive handwriting, some smudging. Need accurate text including quantities.", category: "AUDIO_TRANSCRIPTION", urgency: "NORMAL", estimatedMinutes: 20, slotCount: 1, statedPriceUsdt: 6, instantAcceptUsdt: 5 },
  { title: "Tag sentiment on 80 short product reviews", description: "Three-class sentiment with a 'sarcasm' flag. Guidelines provided. Quick judgment task.", category: "DATA_LABELING", urgency: "LOW", estimatedMinutes: 55, slotCount: 2, statedPriceUsdt: 9, instantAcceptUsdt: 7 },
  { title: "Drop off a sealed envelope across town", description: "Hand-deliver a sealed legal envelope to a named recipient and get a photo of the handoff or a signature.", category: "DELIVERY_RUNNER", urgency: "CRITICAL", estimatedMinutes: 60, slotCount: 1, statedPriceUsdt: 14, instantAcceptUsdt: 10, deadlineDays: 1 },
];

const TASK: Seed[] = [
  { title: "Replace a leaking kitchen sink P-trap", description: "Diagnose and replace a corroded P-trap, test for leaks, and document with before/after photos.", category: "PLUMBING", urgency: "URGENT", estimatedMinutes: 120, slotCount: 1, statedPriceUsdt: 220, instantAcceptUsdt: 170 },
  { title: "Diagnose intermittent no-start on a 2014 diesel pickup", description: "Road-test, scan codes, isolate the fault (suspected fuel or glow-plug circuit), produce a written diagnosis.", category: "AUTO_MECHANIC", urgency: "NORMAL", estimatedMinutes: 180, slotCount: 1, statedPriceUsdt: 330, instantAcceptUsdt: 260 },
  { title: "TIG-weld a cracked aluminium bracket assembly", description: "Prep, weld, and dress two cracked aluminium brackets to spec. Material supplied. Visual to AWS D1.2.", category: "WELDING_FABRICATION", urgency: "NORMAL", estimatedMinutes: 240, slotCount: 1, statedPriceUsdt: 380, instantAcceptUsdt: 300 },
  { title: "On-site UX review of a kiosk checkout flow", description: "Observe 5 real users completing checkout on a retail kiosk, note friction points, deliver a findings doc.", category: "UX_UI_DESIGN", urgency: "NORMAL", estimatedMinutes: 300, slotCount: 1, statedPriceUsdt: 650, instantAcceptUsdt: 480, minReputation: 0.7 },
  { title: "Studio voice-over: 1,200-word explainer script", description: "Record a warm, neutral-American explainer VO. Deliver clean WAV stems plus one alt read.", category: "VOCAL_PERFORMANCE", urgency: "URGENT", estimatedMinutes: 180, slotCount: 1, statedPriceUsdt: 600, instantAcceptUsdt: 450 },
  { title: "Translate a legal contract EN→Basque", description: "8-page commercial contract into Basque. Low-resource pair, NMT unreliable. Certified-quality translation.", category: "TRANSLATION_RARE_LANGUAGE", urgency: "NORMAL", estimatedMinutes: 420, slotCount: 1, statedPriceUsdt: 1050, instantAcceptUsdt: 850, minReputation: 0.8 },
  { title: "Cater and plate a 12-person tasting dinner", description: "Design and execute a 5-course tasting menu for 12, dietary constraints provided. Kitchen on-site.", category: "PROFESSIONAL_COOKING", urgency: "NORMAL", estimatedMinutes: 360, slotCount: 2, statedPriceUsdt: 420, instantAcceptUsdt: 320 },
  { title: "Notarize and witness a stack of estate documents", description: "Travel to client, verify ID, notarize 14 documents, and witness signatures. Bring journal and seal.", category: "NOTARY_WITNESS", urgency: "URGENT", estimatedMinutes: 90, slotCount: 1, statedPriceUsdt: 120, instantAcceptUsdt: 90 },
  { title: "Half-day investigative records pull on a shell company", description: "County and registry research on a named entity: filings, liens, related parties. Deliver a sourced memo.", category: "INVESTIGATIVE_RESEARCH", urgency: "NORMAL", estimatedMinutes: 300, slotCount: 1, statedPriceUsdt: 800, instantAcceptUsdt: 600, minReputation: 0.6 },
  { title: "Service and inspect 6 backyard beehives", description: "Full inspection of 6 hives: queen status, brood, mites, stores. Treat as needed and write a colony report.", category: "BEEKEEPING", urgency: "LOW", estimatedMinutes: 240, slotCount: 1, statedPriceUsdt: 220, instantAcceptUsdt: 170 },
];

const JOB: Seed[] = [
  { title: "5-day kitchen remodel: cabinetry & finish carpentry", description: "Demo existing cabinets, install new boxes, hang and scribe doors, build and fit trim. Daily milestone sign-off.", category: "CARPENTRY", urgency: "NORMAL", estimatedMinutes: 2400, slotCount: 1, statedPriceUsdt: 3400, instantAcceptUsdt: 2800 },
  { title: "2-week rewire of a small commercial unit", description: "Full rewire to code: panel, circuits, fixtures, inspection prep. Milestoned by zone with daily evidence.", category: "ELECTRICAL", urgency: "URGENT", estimatedMinutes: 4800, slotCount: 1, statedPriceUsdt: 7800, instantAcceptUsdt: 6500, minReputation: 0.75 },
  { title: "10-day documentary scoring & live instrument tracking", description: "Compose and record original score across 10 sessions; deliver stems per milestone for review.", category: "MUSICAL_INSTRUMENT", urgency: "NORMAL", estimatedMinutes: 3600, slotCount: 1, statedPriceUsdt: 6000, instantAcceptUsdt: 4800 },
  { title: "3-day crisis-comms war room for a product recall", description: "Stand up and run crisis communications: holding statements, stakeholder map, daily situation reports.", category: "CRISIS_CONSULTING", urgency: "CRITICAL", estimatedMinutes: 1440, slotCount: 1, statedPriceUsdt: 4200, instantAcceptUsdt: 3400, minReputation: 0.8, deadlineDays: 7 },
  { title: "6-day livestock relocation and husbandry program", description: "Move and settle a herd, daily health checks, feeding regime, and a written husbandry handover.", category: "LIVESTOCK_HANDLING", urgency: "NORMAL", estimatedMinutes: 2880, slotCount: 2, statedPriceUsdt: 1400, instantAcceptUsdt: 1100 },
  { title: "4-day arborist program: hazard tree removal x9", description: "Assess, climb, and remove 9 hazard trees across a property. Daily milestone with photo + debris report.", category: "ARBORIST_TREE_CLIMBING", urgency: "URGENT", estimatedMinutes: 1920, slotCount: 1, statedPriceUsdt: 2600, instantAcceptUsdt: 2000 },
  { title: "Multi-day bespoke tailoring: 3-piece commission", description: "Pattern, cut, fit, and finish a bespoke three-piece suit over several fittings. Milestoned by garment stage.", category: "TAILORING", urgency: "LOW", estimatedMinutes: 1800, slotCount: 1, statedPriceUsdt: 1500, instantAcceptUsdt: 1150 },
  { title: "7-day forecasting engagement: supply-chain scenarios", description: "Build probabilistic scenarios for a disrupted supply chain; daily model updates and a final brief.", category: "FORECASTING_ANALYSIS", urgency: "NORMAL", estimatedMinutes: 3360, slotCount: 1, statedPriceUsdt: 5200, instantAcceptUsdt: 4200, minReputation: 0.7 },
  { title: "5-day working-dog training intensive (detection)", description: "Detection-dog foundation and proofing across 5 daily sessions. Video evidence and progress log per day.", category: "WORKING_DOG_TRAINING", urgency: "NORMAL", estimatedMinutes: 1500, slotCount: 1, statedPriceUsdt: 1900, instantAcceptUsdt: 1500 },
  { title: "2-week HVAC retrofit for a small office", description: "Replace rooftop unit, rework ducting, commission and balance the system. Milestoned by phase.", category: "HVAC", urgency: "URGENT", estimatedMinutes: 4800, slotCount: 1, statedPriceUsdt: 7200, instantAcceptUsdt: 5800 },
];

async function main() {
  const reset = process.argv.includes("--reset");

  const poster = await prisma.user.upsert({
    where: { username: POSTER_USERNAME },
    update: {},
    create: {
      username: POSTER_USERNAME,
      solanaPubkey: POSTER_PUBKEY,
      role: "AI",
      txVerified: true,
      tosAcceptedAt: new Date(),
      tosVersion: process.env.TOS_VERSION || "2026-05-15",
    },
  });

  // A couple of rated mock humans so bidding/eligibility is demonstrable.
  const humans: Array<{ username: string; pubkey: string; categories: Category[]; microPaid: number; taskPaid: number; jobPaid: number; rejectedCount: number }> = [
    { username: "mock_human_pro", pubkey: "MockHumanProSeedPubkey22222222222222222222222", categories: ["PHOTO_VERIFICATION", "LOCAL_OBSERVATION", "PLUMBING", "CARPENTRY", "HVAC"], microPaid: 40, taskPaid: 12, jobPaid: 3, rejectedCount: 1 },
    { username: "mock_human_new", pubkey: "MockHumanNewSeedPubkey33333333333333333333333", categories: ["DATA_LABELING", "AUDIO_TRANSCRIPTION", "DELIVERY_RUNNER"], microPaid: 0, taskPaid: 0, jobPaid: 0, rejectedCount: 0 },
  ];
  for (const h of humans) {
    const u = await prisma.user.upsert({
      where: { username: h.username },
      update: {},
      create: {
        username: h.username,
        solanaPubkey: h.pubkey,
        role: "HUMAN",
        txVerified: true,
        tosAcceptedAt: new Date(),
        tosVersion: process.env.TOS_VERSION || "2026-05-15",
      },
    });
    await prisma.humanProfile.upsert({
      where: { userId: u.id },
      update: {
        categories: h.categories,
        microPaid: h.microPaid,
        taskPaid: h.taskPaid,
        jobPaid: h.jobPaid,
        rejectedCount: h.rejectedCount,
        completed: h.microPaid + h.taskPaid + h.jobPaid,
      },
      create: {
        userId: u.id,
        categories: h.categories,
        microPaid: h.microPaid,
        taskPaid: h.taskPaid,
        jobPaid: h.jobPaid,
        rejectedCount: h.rejectedCount,
        completed: h.microPaid + h.taskPaid + h.jobPaid,
      },
    });
  }

  if (reset) {
    const del = await prisma.task.deleteMany({ where: { posterId: poster.id } });
    console.log(`Deleted ${del.count} previously seeded mock tasks.`);
  }

  const all: { type: "MICRO" | "TASK" | "JOB"; seeds: Seed[] }[] = [
    { type: "MICRO", seeds: MICRO },
    { type: "TASK", seeds: TASK },
    { type: "JOB", seeds: JOB },
  ];

  // Spread of deadline lengths (in days) so every task shows a distinct
  // countdown, ranging from a few hours up to ~30 days.
  const DEADLINE_DAYS = [0.25, 1.5, 3, 5, 8, 12, 16, 21, 26, 30];

  let created = 0;
  for (const { type, seeds } of all) {
    for (const [i, s] of seeds.entries()) {
      const quote = quoteEscrow({
        statedPriceUsdt: s.statedPriceUsdt,
        slotCount: s.slotCount,
      });

      const loc = LOCATIONS[created % LOCATIONS.length];
      await prisma.task.create({
        data: {
          posterId: poster.id,
          type,
          title: s.title,
          description: s.description,
          category: s.category,
          urgency: s.urgency,
          privacy: "PUBLIC",
          slotCount: s.slotCount,
          estimatedMinutes: s.estimatedMinutes,
          statedPriceUsdt: new Prisma.Decimal(s.statedPriceUsdt.toFixed(6)),
          instantAcceptUsdt: new Prisma.Decimal(s.instantAcceptUsdt.toFixed(6)),
          minReputation: s.minReputation ?? null,
          country: loc.country,
          city: loc.country ? loc.city : null,
          deadlineAt: new Date(
            Date.now() +
              (s.deadlineDays ??
                // rotate the spread per tier so MICRO/TASK/JOB also differ
                DEADLINE_DAYS[(i + (type === "TASK" ? 3 : type === "JOB" ? 6 : 0)) % DEADLINE_DAYS.length]) *
                86_400_000,
          ),
          totalUsdt: new Prisma.Decimal(quote.totalUsdt.toFixed(6)),
          status: "OPEN",
          fundedAt: new Date(),
          escrowTxSig: `MOCK_SEED_TX_${type}_${created}`,
          expiresAt: new Date(Date.now() + 30 * 86_400_000),
          slots: {
            create: Array.from({ length: s.slotCount }, () => ({ status: "OPEN" as const })),
          },
        },
      });
      created++;
    }
  }

  console.log(`Seeded ${created} tasks (10 MICRO, 10 TASK, 10 JOB) + ${humans.length} mock humans for @${poster.username}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
