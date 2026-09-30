/**
 * Sandboxed demo data — used when ?demo=true is in the URL.
 * Completely bypasses Prisma; shapes match the exact types consumed
 * by the dashboard and quotes pages.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEMO_PROJECT_ID = "demo-3bhk";
export const DEMO_PROJECT_NAME = "3BHK Noida Sector 150 — Demo";
export const DEMO_RFQ_STATUS = "OPEN" as const;

// ---------------------------------------------------------------------------
// Dashboard — matches `prisma.project.findMany({ include: { quoteRequest } })`
// ---------------------------------------------------------------------------

export const DEMO_DASHBOARD_PROJECTS = [
  {
    id: DEMO_PROJECT_ID,
    ownerId: "demo-user",
    projectName: DEMO_PROJECT_NAME,
    projectType: "RESIDENTIAL" as const,
    status: "RFQ_SUBMITTED" as const,
    inputData: {},
    bomData: {
      totalConnectedLoadKw: 6.5,
      maxDemandKw: 4.2,
      pricing: { materialCost: 85000 },
    },
    totalEstimate: 85000,
    createdAt: new Date(),
    updatedAt: new Date(),
    quoteRequest: {
      id: "demo-rfq",
      projectId: DEMO_PROJECT_ID,
      status: DEMO_RFQ_STATUS,
      visibilityCity: "NCR",
      visibilityPincode: null,
      maxQuotes: 5,
      quoteCount: 4,
      createdAt: new Date(),
      expiresAt: null,
    },
  },
];

// ---------------------------------------------------------------------------
// Quotes — structural match with ProjectQuoteView
// ---------------------------------------------------------------------------
// Grades are deliberately mixed. The cheapest quote here is also the lowest
// insulation grade, which is the whole point of showing the column: a visitor
// scanning the demo should see for themselves that the lowest number is not
// automatically the best deal.
// ---------------------------------------------------------------------------

export const DEMO_QUOTES = [
  {
    id: "demo-q1",
    totalPrice: 72000,
    brandOffered: "Polycab",
    wireGrade: "FR",
    deliveryDays: 3,
    details: "Standard Polycab FR range. Includes free installation supervision for NCR.",
    status: "SUBMITTED",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    validUntil: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    hasLapsed: false,
    expiresSoon: false,
    dealerName: "Gupta Electricals, Noida",
    dealerCity: "Noida",
    dealerEmail: null,
    dealerPhone: null,
  },
  {
    id: "demo-q2",
    totalPrice: 78500,
    brandOffered: "Finolex",
    wireGrade: "FRLS",
    deliveryDays: 5,
    details: "Finolex FRLS wires with 2-year warranty extension.",
    status: "SUBMITTED",
    createdAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    validUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    hasLapsed: false,
    expiresSoon: false,
    dealerName: "NCR Wire House, Ghaziabad",
    dealerCity: "Ghaziabad",
    dealerEmail: null,
    dealerPhone: null,
  },
  {
    id: "demo-q3",
    totalPrice: 84000,
    brandOffered: "Havells",
    wireGrade: "FRLS",
    deliveryDays: 2,
    details: "Havells Lifeline Plus. Express 2-day delivery for NCR projects.",
    // Left rejected on purpose: it is the one row in the demo that shows what
    // a decided quote looks like, and the only one offering Remove.
    status: "REJECTED",
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    validUntil: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    hasLapsed: false,
    expiresSoon: false,
    dealerName: "Capital Cables, Delhi",
    dealerCity: "Delhi",
    dealerEmail: null,
    dealerPhone: null,
  },
  {
    id: "demo-q4",
    totalPrice: 95000,
    brandOffered: "Anchor by Panasonic",
    wireGrade: "ZHFR",
    deliveryDays: 4,
    details:
      "Zero-halogen cable throughout. Premium Anchor Roma modular range included, full wiring harness kit.",
    status: "SUBMITTED",
    createdAt: new Date(Date.now() - 0.5 * 60 * 60 * 1000).toISOString(),
    validUntil: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    hasLapsed: false,
    expiresSoon: true,
    dealerName: "Metro Electrical, Gurugram",
    dealerCity: "Gurugram",
    dealerEmail: null,
    dealerPhone: null,
  },
];
