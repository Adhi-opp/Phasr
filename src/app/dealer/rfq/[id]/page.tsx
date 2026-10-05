import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dealerRfqStatus } from "@/features/quotes/validity";
import { buildDistributionSchedule } from "@/features/calculator/boardEngine";
import type { CircuitDefinition } from "@/features/calculator/type";
import { RfqDetailClient, type BomSnapshot } from "./RfqDetailClient";

export const metadata: Metadata = {
  title: "Quote Request",
};

// ---------------------------------------------------------------------------
// bomData → requisition snapshot
// ---------------------------------------------------------------------------
// The previous parser flattened every line into {description, qty, unit} and
// threw away coilsRequired, coilLengthMeters, surplusMeters and the gauge. A
// dealer pricing cable needs the coil count — "487 m of 2.5 sq mm" is not
// something anyone stocks or sells, "6 × 90 m coils" is. So the schedules are
// preserved separately here rather than mashed into one item list.
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "1.5 sq mm FR PVC Copper Wire (Lighting)" -> "Lighting" */
function purposeOf(description: string): string {
  const match = description.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : "General";
}

export function parseBomSnapshot(raw: unknown): BomSnapshot | null {
  if (!isRecord(raw)) return null;

  const pricing = raw.pricing;
  if (!isRecord(pricing)) return null;

  const materialCost = num(pricing.materialCost);
  const totalConnectedLoadKw = num(raw.totalConnectedLoadKw);
  const maxDemandKw = num(raw.maxDemandKw);
  const totalCircuits = num(raw.totalCircuits);

  if (materialCost == null || totalConnectedLoadKw == null || maxDemandKw == null) {
    return null;
  }

  const phaseDecision = raw.phaseDecision;
  const phase =
    isRecord(phaseDecision) && typeof phaseDecision.finalRecommendation === "string"
      ? phaseDecision.finalRecommendation
      : "SINGLE";

  const items = Array.isArray(raw.items)
    ? (raw.items as unknown[]).filter(isRecord)
    : [];

  const cable: BomSnapshot["cable"] = [];
  const conduit: BomSnapshot["conduit"] = [];
  const distribution: BomSnapshot["distribution"] = [];

  for (const item of items) {
    const category = String(item.category ?? "");
    const description = String(item.description ?? "");

    if (category === "WIRE" || category === "EARTH_WIRE") {
      cable.push({
        category,
        description,
        sizeSqMm: num(item.sizeSqMm),
        purpose: category === "EARTH_WIRE" ? "Earthing" : purposeOf(description),
        totalMeters: num(item.totalMeters) ?? 0,
        purchasableMeters: num(item.purchasableMeters) ?? 0,
        surplusMeters: num(item.surplusMeters) ?? 0,
        coilsRequired: num(item.coilsRequired) ?? 0,
        coilLengthMeters: num(item.coilLengthMeters) ?? 0,
      });
      continue;
    }

    if (category === "CONDUIT") {
      conduit.push({
        description,
        sizeMm: typeof item.sizeMm === "string" ? item.sizeMm : "—",
        totalMeters: num(item.totalMeters) ?? 0,
      });
      continue;
    }

    // MCB, RCCB, DB, SWITCHGEAR — everything counted in pieces.
    distribution.push({
      category,
      description,
      quantity: num(item.quantity) ?? 0,
      ratingAmps: num(item.ratingAmps),
    });
  }

  // Heaviest gauge first: that is the main run, and it is what a dealer
  // checks stock on before anything else.
  cable.sort((a, b) => (b.sizeSqMm ?? 0) - (a.sizeSqMm ?? 0));

  const warnings = Array.isArray(raw.warnings)
    ? (raw.warnings as unknown[]).filter((w): w is string => typeof w === "string")
    : [];

  return {
    totalConnectedLoadKw,
    maxDemandKw,
    totalCircuits: totalCircuits ?? 0,
    materialCost,
    phase,
    cable,
    conduit,
    distribution,
    warnings,
  };
}

/**
 * Recovers CircuitDefinition rows from stored bomData so the board schedule
 * can be rebuilt.
 *
 * The schedule is derived, never persisted — a project saved before the board
 * engine existed still gets one, and a project saved today gets the current
 * rules rather than a frozen copy of whatever we shipped that week. Rows
 * missing the fields the engine needs are dropped rather than defaulted,
 * because a guessed conductor size would produce a guessed breaker.
 */
function parseCircuits(raw: unknown): CircuitDefinition[] {
  if (!isRecord(raw) || !Array.isArray(raw.circuits)) return [];

  return (raw.circuits as unknown[]).filter(isRecord).flatMap((c) => {
    const circuitId = typeof c.circuitId === "string" ? c.circuitId : null;
    const wireGauge = typeof c.wireGauge === "string" ? c.wireGauge : null;
    const mcbRatingAmps = num(c.mcbRatingAmps);

    if (!circuitId || !wireGauge || mcbRatingAmps == null) return [];

    return [
      {
        circuitId,
        circuitType: String(c.circuitType ?? "POWER_15A"),
        roomId: String(c.roomId ?? ""),
        roomName: String(c.roomName ?? "—"),
        floor: num(c.floor) ?? 0,
        wireGauge,
        mcbRatingAmps,
        pointCount: num(c.pointCount) ?? 0,
        pointDescription: String(c.pointDescription ?? ""),
        wireLengthMeters: num(c.wireLengthMeters) ?? 0,
        conduitLengthMeters: num(c.conduitLengthMeters) ?? 0,
      } as CircuitDefinition,
    ];
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RfqDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "DEALER" && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const rfq = await prisma.quoteRequest.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          projectName: true,
          totalEstimate: true,
          bomData: true,
          createdAt: true,
        },
      },
      quotes: {
        where: { dealerId: session.user.id },
        select: {
          id: true,
          totalPrice: true,
          brandOffered: true,
          wireGrade: true,
          deliveryDays: true,
          validUntil: true,
          status: true,
        },
        take: 1,
      },
      _count: { select: { quotes: true } },
    },
  });

  if (!rfq) {
    notFound();
  }

  const bom = parseBomSnapshot(rfq.project.bomData);
  const existingQuote = rfq.quotes[0] ?? null;

  // Derived here rather than in the client: the engine is pure, the result is
  // plain serialisable data, and doing it server-side keeps the raw circuit
  // list off the wire.
  const circuits = parseCircuits(rfq.project.bomData);
  const schedule =
    bom && circuits.length > 0
      ? buildDistributionSchedule({
          circuits,
          supply: bom.phase === "THREE" ? "THREE" : "SINGLE",
          maxDemandKw: bom.maxDemandKw,
        })
      : null;

  // Dealers without an approved profile can read a requisition but not bid on
  // it — the same rule submitQuoteTransaction enforces, surfaced before the
  // form rather than after a rejected submit.
  const dealerProfile = await prisma.dealerProfile.findUnique({
    where: { userId: session.user.id },
    select: { approvalStatus: true },
  });

  return (
    <RfqDetailClient
      rfqId={rfq.id}
      // FULL once every bid slot is taken: still OPEN for its buyer, closed
      // to bidding. Without it the form would offer a bid the server refuses.
      rfqStatus={dealerRfqStatus(rfq)}
      projectName={rfq.project.projectName}
      createdAt={rfq.createdAt.toISOString()}
      expiresAt={rfq.expiresAt?.toISOString() ?? null}
      visibilityCity={rfq.visibilityCity}
      bidCount={rfq._count.quotes}
      maxQuotes={rfq.maxQuotes}
      isApproved={dealerProfile?.approvalStatus === "APPROVED"}
      bom={bom}
      schedule={schedule}
      fallbackEstimate={rfq.project.totalEstimate}
      existingQuote={
        existingQuote
          ? {
              id: existingQuote.id,
              totalPrice: existingQuote.totalPrice,
              brandOffered: existingQuote.brandOffered,
              wireGrade: existingQuote.wireGrade,
              deliveryDays: existingQuote.deliveryDays,
              validUntil: existingQuote.validUntil?.toISOString() ?? null,
              status: existingQuote.status,
            }
          : null
      }
    />
  );
}
