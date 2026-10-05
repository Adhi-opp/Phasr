/**
 * Sandboxed demo data — used when ?demo=true is in the URL.
 * Completely bypasses Prisma; shapes match the exact types consumed
 * by the dashboard and quotes pages.
 *
 * The project's load and estimate are the engine's real output for the demo
 * layout, computed when this module loads, so the demo can never drift from
 * what the calculator says. Quotes are priced around that estimate, offered
 * under generic trade tiers rather than real brand names, and sit inside the
 * same 72-hour validity every real quote gets.
 */

import { calculateBOM } from "@/features/calculator/calculateBOM";
import { applyPricing } from "@/features/calculator/costEngine";
import { buildCalculatorInput } from "@/features/calculator/generateRoomSpecs";
import type { LayoutInput } from "@/features/calculator/layoutTypes";
import {
  QUOTE_EXPIRY_WARNING_HOURS,
  QUOTE_VALIDITY_HOURS,
  RFQ_LIFETIME_HOURS,
} from "@/features/quotes/validity";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEMO_PROJECT_ID = "demo-3bhk";
export const DEMO_PROJECT_NAME = "3BHK Noida Sector 150 — Demo";
export const DEMO_RFQ_STATUS = "OPEN" as const;

const DEMO_LAYOUT: LayoutInput = {
  propertyType: "FLAT",
  city: "Noida",
  bedrooms: 3,
  bathrooms: 2,
  balconies: 2,
  totalFloors: 1,
  modularKitchen: true,
  acInBedrooms: true,
  acInLivingRoom: true,
  geyserInBathrooms: true,
};

const DEMO_BOM = applyPricing(calculateBOM(buildCalculatorInput(DEMO_LAYOUT)));
const DEMO_ESTIMATE = Math.round(DEMO_BOM.pricing.materialCost);

const HOUR_MS = 60 * 60 * 1000;

/** The request went out this long ago; every quote below arrived after it. */
const RFQ_AGE_HOURS = 60;

/** A dealer's price as a share of the estimate, rounded to ₹500 as dealers quote. */
function priced(shareOfEstimate: number): number {
  return Math.round((DEMO_ESTIMATE * shareOfEstimate) / 500) * 500;
}

/** Timing for a quote submitted `ageHours` ago, held for the standard window. */
function submitted(ageHours: number) {
  const now = Date.now();
  const createdAt = now - ageHours * HOUR_MS;
  const validUntil = createdAt + QUOTE_VALIDITY_HOURS * HOUR_MS;
  return {
    createdAt: new Date(createdAt).toISOString(),
    validUntil: new Date(validUntil).toISOString(),
    hasLapsed: false,
    expiresSoon: validUntil - now <= QUOTE_EXPIRY_WARNING_HOURS * HOUR_MS,
  };
}

// ---------------------------------------------------------------------------
// Dashboard — matches `prisma.project.findMany({ include: { quoteRequest } })`
// ---------------------------------------------------------------------------

const rfqCreatedAt = new Date(Date.now() - RFQ_AGE_HOURS * HOUR_MS);

export const DEMO_DASHBOARD_PROJECTS = [
  {
    id: DEMO_PROJECT_ID,
    ownerId: "demo-user",
    projectName: DEMO_PROJECT_NAME,
    projectType: "RESIDENTIAL" as const,
    status: "RFQ_SUBMITTED" as const,
    inputData: {},
    bomData: {
      totalConnectedLoadKw: DEMO_BOM.totalConnectedLoadKw,
      maxDemandKw: DEMO_BOM.maxDemandKw,
      pricing: { materialCost: DEMO_ESTIMATE },
    },
    totalEstimate: DEMO_ESTIMATE,
    createdAt: rfqCreatedAt,
    updatedAt: rfqCreatedAt,
    quoteRequest: {
      id: "demo-rfq",
      projectId: DEMO_PROJECT_ID,
      status: DEMO_RFQ_STATUS,
      visibilityCity: "NCR",
      visibilityPincode: null,
      maxQuotes: 5,
      quoteCount: 4,
      createdAt: rfqCreatedAt,
      expiresAt: new Date(rfqCreatedAt.getTime() + RFQ_LIFETIME_HOURS * HOUR_MS),
    },
  },
];

// ---------------------------------------------------------------------------
// Quotes — structural match with ProjectQuoteView
// ---------------------------------------------------------------------------
// Grades are deliberately mixed. The cheapest quote here is also the lowest
// insulation grade, which is the whole point of showing the column: a visitor
// scanning the demo should see for themselves that the lowest number is not
// automatically the best deal. The oldest quote is inside its last 24 hours,
// so the matrix shows its expiring-soon flag.
// ---------------------------------------------------------------------------

export const DEMO_QUOTES = [
  {
    id: "demo-q1",
    totalPrice: priced(0.93),
    brandOffered: "Value range",
    wireGrade: "FR",
    deliveryDays: 3,
    details: "FR-grade cable throughout. Free installation supervision within NCR.",
    status: "SUBMITTED",
    ...submitted(6),
    dealerName: "Gupta Electricals, Noida",
    dealerCity: "Noida",
    dealerEmail: null,
    dealerPhone: null,
  },
  {
    id: "demo-q2",
    totalPrice: priced(1.0),
    brandOffered: "Standard range",
    wireGrade: "FRLS",
    deliveryDays: 5,
    details: "Low-smoke FRLS cable, with a two-year warranty extension.",
    status: "SUBMITTED",
    ...submitted(20),
    dealerName: "NCR Wire House, Ghaziabad",
    dealerCity: "Ghaziabad",
    dealerEmail: null,
    dealerPhone: null,
  },
  {
    id: "demo-q3",
    totalPrice: priced(1.06),
    brandOffered: "Standard range",
    wireGrade: "FRLS",
    deliveryDays: 2,
    details: "Low-smoke FRLS cable. Express two-day delivery for NCR projects.",
    // Left rejected on purpose: it is the one row in the demo that shows what
    // a decided quote looks like, and the only one offering Remove.
    status: "REJECTED",
    ...submitted(30),
    dealerName: "Capital Cables, Delhi",
    dealerCity: "Delhi",
    dealerEmail: null,
    dealerPhone: null,
  },
  {
    id: "demo-q4",
    totalPrice: priced(1.17),
    brandOffered: "Premium range",
    wireGrade: "ZHFR",
    deliveryDays: 4,
    details:
      "Zero-halogen cable throughout, with a premium modular switch range and a full wiring harness kit.",
    status: "SUBMITTED",
    ...submitted(54),
    dealerName: "Metro Electrical, Gurugram",
    dealerCity: "Gurugram",
    dealerEmail: null,
    dealerPhone: null,
  },
];
