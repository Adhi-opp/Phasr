// prisma/seed.ts
// ============================================================================
// VOLTFLOW SEED
// ============================================================================
// Enough of a world to click the whole product end to end without touching
// the admin screens first:
//
//   admin@voltflow.in      ADMIN     — approvals, RFQ and quote oversight
//   homeowner@voltflow.in  HOMEOWNER — owns the seeded project
//   dealer@voltflow.in     DEALER    — APPROVED, can quote immediately
//   dealer2@voltflow.in    DEALER    — PENDING, for testing the approval gate
//
// Password for all four: password123
//
// Idempotent throughout: every write is an upsert keyed on a natural unique
// (email, userId, clientRequestId, wireType+brand), so running this twice
// changes nothing and never duplicates a row.
//
// Run with: npx prisma db seed
//
// DEV DATABASES ONLY. Production is a separate Supabase project that is never
// seeded — see the two guards below, which refuse a production process and a
// database that already has real users.
//
// NOTE ON OLD ROWS — earlier seeds used @wiremart.in addresses. Those users
// still exist in any database seeded before the rename. This script does not
// delete them, because deleting users cascades to their projects and quotes.
// Remove them by hand once you have confirmed you do not need their data.
// ============================================================================

import { PrismaClient, type Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import {
  quoteValidUntilFrom,
  rfqExpiryFrom,
} from "../src/features/quotes/validity";
import { calculateBOM } from "../src/features/calculator/calculateBOM";
import { applyPricing } from "../src/features/calculator/costEngine";
import { buildCalculatorInput } from "../src/features/calculator/generateRoomSpecs";
import type { LayoutInput } from "../src/features/calculator/layoutTypes";

// ── Guard 1: never from a production process ──────────────────────────────
// Vercel builds run with NODE_ENV=production. The build script only calls
// `prisma migrate deploy`, which never seeds, so this should never fire — it
// is here so that stays true if `migrate reset` or `db seed` is ever added to
// the pipeline. Exits 0 so a blocked seed does not fail a deploy.
if (process.env.NODE_ENV === "production") {
  console.warn("Seed blocked in production");
  process.exit(0);
}

const prisma = new PrismaClient();

/**
 * Runs the real engine rather than writing a stub.
 *
 * A hand-written bomData blob has no items array, so the dealer's requisition
 * sheet falls through to "no itemised schedule" and the cable and conduit
 * tables never render — which means the seed cannot be used to test the screen
 * it exists to test. The calculator is pure (no server-only imports, no
 * database), so the seed can just call it.
 */
function buildBom(layout: LayoutInput) {
  const bom = calculateBOM(buildCalculatorInput(layout));
  return applyPricing(bom);
}

/** EnrichedBOMResult -> a Prisma JSON column. */
function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

async function main() {
  // ── Guard 2: never into a database that has real users ──────────────────
  // Guard 1 cannot see the likelier accident: running `npx prisma db seed` on
  // your own machine while .env points at the production database. NODE_ENV
  // is unset there, so it passes. This checks the database instead. A dev
  // database is either empty (first seed) or already holds the seed admin; one
  // with users but no seed admin is a real database, and seeding it would
  // plant a login whose password is published in this repo.
  const [userCount, seedAdmin] = await Promise.all([
    prisma.user.count(),
    prisma.user.findUnique({
      where: { email: "admin@voltflow.in" },
      select: { id: true },
    }),
  ]);

  if (userCount > 0 && !seedAdmin) {
    console.error(
      `Seed blocked: this database has ${userCount} user(s) and has never been seeded, so it is not a dev database. Nothing was written.`
    );
    process.exitCode = 1;
    return;
  }

  const pw = await hash("password123", 12);
  const now = new Date();

  // ── People ──────────────────────────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: { email: "admin@voltflow.in" },
    update: {},
    create: {
      email: "admin@voltflow.in",
      name: "VoltFlow Admin",
      password: pw,
      role: "ADMIN",
    },
  });

  const homeowner = await prisma.user.upsert({
    where: { email: "homeowner@voltflow.in" },
    update: {},
    create: {
      email: "homeowner@voltflow.in",
      name: "Rahul Sharma",
      phone: "+91-9876543210",
      password: pw,
      role: "HOMEOWNER",
    },
  });

  // ── Approved dealer ─────────────────────────────────────────────────────
  // Nehru Place is the real wholesale electrical market for South Delhi, and
  // the GSTIN carries the 07 state code for Delhi so it reads as plausible in
  // the admin approval screen. serviceAreas must contain "NCR" — that is the
  // value deriveVisibilityCity() stamps on every RFQ from the calculator, and
  // the dealer dashboard matches on it. A dealer listing only "DELHI" would
  // see an empty board and look like a bug.

  const dealer = await prisma.user.upsert({
    where: { email: "dealer@voltflow.in" },
    update: {},
    create: {
      email: "dealer@voltflow.in",
      name: "Vikram Singh",
      phone: "+91-9988776655",
      password: pw,
      role: "DEALER",
    },
  });

  await prisma.dealerProfile.upsert({
    where: { userId: dealer.id },
    update: { approvalStatus: "APPROVED" },
    create: {
      userId: dealer.id,
      companyName: "Singh Electricals & Cables",
      gstin: "07AAACH7409R1ZZ",
      address: "M-14, Palika Bhawan, Nehru Place",
      city: "NCR",
      state: "Delhi",
      pincode: "110019",
      serviceAreas: ["NCR", "DELHI", "NOIDA", "GURUGRAM"],
      brandsSold: ["Polycab", "Havells", "Finolex", "RR Kabel"],
      approvalStatus: "APPROVED",
      subscriptionTier: "BASIC",
    },
  });

  // ── Pending dealer, for testing the approval gate ───────────────────────

  const pendingDealer = await prisma.user.upsert({
    where: { email: "dealer2@voltflow.in" },
    update: {},
    create: {
      email: "dealer2@voltflow.in",
      name: "Ankit Gupta",
      phone: "+91-9112233445",
      password: pw,
      role: "DEALER",
    },
  });

  await prisma.dealerProfile.upsert({
    where: { userId: pendingDealer.id },
    update: {},
    create: {
      userId: pendingDealer.id,
      companyName: "Gupta Wire House",
      gstin: "09AAACG1234M1Z5",
      address: "C-45, Sector 62",
      city: "NCR",
      state: "Uttar Pradesh",
      pincode: "201301",
      serviceAreas: ["NCR", "NOIDA", "GHAZIABAD"],
      brandsSold: ["Finolex", "KEI"],
      approvalStatus: "PENDING",
    },
  });

  // ── Project A: an open RFQ that already has two competing bids ──────────
  // This is the buyer's comparison-matrix fixture.

  const layoutA: LayoutInput = {
    propertyType: "FLAT",
    city: "NCR",
    bedrooms: 2,
    bathrooms: 2,
    balconies: 1,
    totalFloors: 1,
    approxSqFt: 1050,
    modularKitchen: true,
    acInBedrooms: true,
    acInLivingRoom: false,
    geyserInBathrooms: true,
  };
  const bomA = buildBom(layoutA);

  const project = await prisma.project.upsert({
    where: { id: "seed-project-001" },
    update: { bomData: asJson(bomA), totalEstimate: bomA.pricing.materialCost },
    create: {
      id: "seed-project-001",
      ownerId: homeowner.id,
      projectName: "2BHK Noida Sector 62",
      projectType: "RESIDENTIAL",
      status: "RFQ_SUBMITTED",
      inputData: { source: "SEED", layout: asJson(layoutA) },
      bomData: asJson(bomA),
      totalEstimate: bomA.pricing.materialCost,
    },
  });

  const rfq = await prisma.quoteRequest.upsert({
    where: { projectId: project.id },
    // Refreshed on re-seed so the window is always live when you sit down to
    // test — a seed whose RFQ expired three days ago tests nothing.
    update: { status: "OPEN", expiresAt: rfqExpiryFrom(now) },
    create: {
      projectId: project.id,
      status: "OPEN",
      visibilityCity: "NCR",
      maxQuotes: 5,
      quoteCount: 2,
      expiresAt: rfqExpiryFrom(now),
    },
  });

  // Two grades at two prices, so the comparison matrix has something real to
  // compare: the cheaper quote is also the lower insulation grade.
  await prisma.quote.upsert({
    where: { clientRequestId: "seed-quote-001" },
    update: { validUntil: quoteValidUntilFrom(now) },
    create: {
      quoteRequestId: rfq.id,
      dealerId: dealer.id,
      clientRequestId: "seed-quote-001",
      totalPrice: 42000,
      brandOffered: "Polycab",
      wireGrade: "FR",
      deliveryDays: 3,
      status: "SUBMITTED",
      validUntil: quoteValidUntilFrom(now),
    },
  });

  await prisma.quote.upsert({
    where: { clientRequestId: "seed-quote-002" },
    update: { validUntil: quoteValidUntilFrom(now) },
    create: {
      quoteRequestId: rfq.id,
      dealerId: pendingDealer.id,
      clientRequestId: "seed-quote-002",
      totalPrice: 47500,
      brandOffered: "Finolex",
      wireGrade: "FRLS",
      deliveryDays: 5,
      status: "SUBMITTED",
      validUntil: quoteValidUntilFrom(now),
    },
  });

  // ── Project B: an open RFQ nobody has bid on ────────────────────────────
  //
  // The dealer board excludes requests you have already quoted, so with only
  // Project A seeded the approved dealer opened an empty board and had nothing
  // to bid on — the one path the click-test most needs. This is a live
  // requisition, three-phase and larger, waiting for a first bid.

  const layoutB: LayoutInput = {
    propertyType: "DUPLEX",
    city: "NCR",
    bedrooms: 4,
    bathrooms: 4,
    balconies: 2,
    totalFloors: 2,
    approxSqFt: 2400,
    modularKitchen: true,
    acInBedrooms: true,
    acInLivingRoom: true,
    geyserInBathrooms: true,
  };
  const bomB = buildBom(layoutB);

  const projectB = await prisma.project.upsert({
    where: { id: "seed-project-002" },
    update: { bomData: asJson(bomB), totalEstimate: bomB.pricing.materialCost },
    create: {
      id: "seed-project-002",
      ownerId: homeowner.id,
      projectName: "4BHK Duplex — Gurugram Sector 57",
      projectType: "RESIDENTIAL",
      status: "RFQ_SUBMITTED",
      inputData: { source: "SEED", layout: asJson(layoutB) },
      bomData: asJson(bomB),
      totalEstimate: bomB.pricing.materialCost,
    },
  });

  await prisma.quoteRequest.upsert({
    where: { projectId: projectB.id },
    update: { status: "OPEN", expiresAt: rfqExpiryFrom(now) },
    create: {
      projectId: projectB.id,
      status: "OPEN",
      visibilityCity: "NCR",
      maxQuotes: 5,
      quoteCount: 0,
      expiresAt: rfqExpiryFrom(now),
    },
  });

  // ── Project C: a single-phase board ─────────────────────────────────────
  //
  // Both projects above cross the three-phase threshold, so neither exercises
  // the single-phase board schedule — the stacked-list layout with a DP
  // incomer, which is what most NCR flats actually get. This is the fixture
  // for that path. Saved as a DRAFT so it does not add noise to the dealer
  // board; open it from the homeowner's dashboard.

  const layoutC: LayoutInput = {
    propertyType: "FLAT",
    city: "NCR",
    bedrooms: 1,
    bathrooms: 1,
    balconies: 1,
    totalFloors: 1,
    approxSqFt: 620,
    modularKitchen: false,
    acInBedrooms: false,
    acInLivingRoom: false,
    geyserInBathrooms: true,
  };
  const bomC = buildBom(layoutC);

  const projectC = await prisma.project.upsert({
    where: { id: "seed-project-003" },
    update: { bomData: asJson(bomC), totalEstimate: bomC.pricing.materialCost },
    create: {
      id: "seed-project-003",
      ownerId: homeowner.id,
      projectName: "1BHK Dwarka — single phase",
      projectType: "RESIDENTIAL",
      status: "ESTIMATED",
      inputData: { source: "SEED", layout: asJson(layoutC) },
      bomData: asJson(bomC),
      totalEstimate: bomC.pricing.materialCost,
    },
  });

  await prisma.quoteRequest.upsert({
    where: { projectId: projectC.id },
    update: {},
    create: {
      projectId: projectC.id,
      status: "DRAFT",
      visibilityCity: "NCR",
      maxQuotes: 5,
      quoteCount: 0,
      expiresAt: null,
    },
  });

  // ── PriceIndex — effective dealer rates per metre of copper wire ────────
  //
  // Until this table has rows, loadRateCardFromDb() silently falls back to the
  // hardcoded RATE_CARD in costEngine.ts, so the dynamic pricing path never
  // actually runs. Seeding it activates that path.
  //
  // wireType MUST start with the gauge in "<n> sq mm" form — loadRatesFromDb
  // parses the leading number to map onto WIRE_1_5, WIRE_2_5 and so on. Rows
  // that do not match that shape are ignored, and non-wire items (MCBs,
  // conduit, switchgear) always use the hardcoded rates.
  //
  // These values intentionally match the RATE_CARD entries marked FINAL, so
  // seeding changes no estimate. They are EFFECTIVE trade prices, i.e. after
  // the dealer discount circular, not MRP.
  //
  // NOTE: verify against a current dealer circular before trusting these. An
  // alternative set was proposed at 1.5→26, 2.5→42, 4.0→64, which looks like
  // MRP before the 40-55% trade discount. Adopting it would raise every
  // estimate by roughly 20%, since wire is about half of material cost.

  const wireRates = [
    { wireType: "1.5 sq mm FR PVC", brand: "Polycab", unitPrice: 18 },
    { wireType: "2.5 sq mm FR PVC", brand: "Polycab", unitPrice: 28 },
    { wireType: "4.0 sq mm FR PVC", brand: "Polycab", unitPrice: 48 },
    { wireType: "6.0 sq mm FR PVC", brand: "Polycab", unitPrice: 72 },
  ];

  for (const rate of wireRates) {
    await prisma.priceIndex.upsert({
      where: { wireType_brand: { wireType: rate.wireType, brand: rate.brand } },
      update: { unitPrice: rate.unitPrice, effectiveDate: now },
      create: { ...rate, unit: "meter" },
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  console.log(`
VoltFlow seed complete.

  Sign in with password123:

    admin@voltflow.in      ADMIN      ${admin.id}
    homeowner@voltflow.in  HOMEOWNER  ${homeowner.id}
    dealer@voltflow.in     DEALER     APPROVED  — Singh Electricals & Cables
    dealer2@voltflow.in    DEALER     PENDING   — Gupta Wire House

  Project A  seed-project-001  "2BHK Noida Sector 62"
             ${formatINR(bomA.pricing.materialCost)} · ${bomA.totalConnectedLoadKw.toFixed(2)} kW · ${bomA.items.length} BOM lines
             RFQ OPEN with 2 bids — the buyer's comparison fixture

  Project B  seed-project-002  "4BHK Duplex — Gurugram Sector 57"
             ${formatINR(bomB.pricing.materialCost)} · ${bomB.totalConnectedLoadKw.toFixed(2)} kW · ${bomB.items.length} BOM lines
             RFQ OPEN with 0 bids — open this one as the dealer and bid

  Project C  seed-project-003  "1BHK Dwarka — single phase"
             ${formatINR(bomC.pricing.materialCost)} · ${bomC.totalConnectedLoadKw.toFixed(2)} kW · single-phase board
             DRAFT — the single-phase board-schedule fixture

  Both open RFQs close ${rfqExpiryFrom(now).toLocaleString("en-IN")}
  Bids valid until ${quoteValidUntilFrom(now).toLocaleDateString("en-IN")}
  Rates      ${wireRates.length} PriceIndex rows
`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
