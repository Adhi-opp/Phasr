import { prisma } from "@/lib/prisma";
import { RATE_CARD, type RateCard } from "./costEngine";
import {
  FALLBACK_DEFAULT_THRESHOLD_KW,
  ncrRuleFor,
  normalizeCityKey,
  type RegulatoryPolicyResult,
} from "./regulatoryPolicy";
import type { PricingCode } from "./type";

/**
 * Maps PriceIndex.wireType patterns to PricingCode keys.
 * PriceIndex stores human-readable wire types like "1.5 sq mm FR PVC".
 * We extract the gauge number and map to our internal codes.
 */
const WIRE_TYPE_TO_PRICING_CODE: Record<string, PricingCode> = {
  "1.5": "WIRE_1_5",
  "2.5": "WIRE_2_5",
  "4.0": "WIRE_4_0",
  "6.0": "WIRE_6_0",
  "10.0": "WIRE_10_0",
  "16.0": "WIRE_16_0",
};

function extractGaugeFromWireType(wireType: string): string | null {
  const match = wireType.match(/^(\d+\.?\d*)\s*sq/i);
  return match ? match[1] : null;
}

/**
 * Loads wire rates from the PriceIndex table and merges them with
 * the hardcoded RATE_CARD fallback. Non-wire items (MCBs, conduit,
 * switchgear) always use the hardcoded rates since PriceIndex only
 * covers wire pricing.
 *
 * For wires with multiple brands, uses the lowest price (best deal).
 *
 * Returns the full RATE_CARD if DB has no rows or on error.
 */
export async function loadRateCardFromDb(): Promise<RateCard> {
  try {
    const rows = await prisma.priceIndex.findMany({
      select: { wireType: true, unitPrice: true },
    });

    if (rows.length === 0) return { ...RATE_CARD };

    // Group by gauge, take minimum price per gauge
    const priceByGauge = new Map<string, number>();
    for (const row of rows) {
      const gauge = extractGaugeFromWireType(row.wireType);
      if (!gauge) continue;

      const existing = priceByGauge.get(gauge);
      if (existing === undefined || row.unitPrice < existing) {
        priceByGauge.set(gauge, row.unitPrice);
      }
    }

    // Start from hardcoded rates, override wire prices from DB
    const merged: RateCard = { ...RATE_CARD };

    for (const [gauge, price] of priceByGauge) {
      const code = WIRE_TYPE_TO_PRICING_CODE[gauge];
      if (code && merged[code]) {
        merged[code] = { rate: price, basis: "per_meter", source: "FINAL" };
      }
    }

    return merged;
  } catch {
    // DB unavailable — fall back to hardcoded rates silently
    return { ...RATE_CARD };
  }
}

/**
 * Async DB-aware resolver, in order of precedence:
 *   1. an active RegulatoryPhasePolicy row for this exact city (an admin
 *      override, e.g. after a regulator changes its threshold);
 *   2. the state rule for an NCR city (regulatoryPolicy.ts, with sources);
 *   3. an active DEFAULT row;
 *   4. the hardcoded default.
 * A DEFAULT row must never shadow a known state rule, so (2) comes before (3).
 */
export async function loadRegulatoryPolicyFromDb(
  city: string
): Promise<RegulatoryPolicyResult> {
  const cityKey = normalizeCityKey(city || "NCR");

  try {
    const row = await prisma.regulatoryPhasePolicy.findFirst({
      where: {
        cityKey: { equals: cityKey, mode: "insensitive" },
        isActive: true,
      },
      select: { cityKey: true, connectedLoadThresholdKw: true },
    });

    if (row) {
      return {
        cityKey: row.cityKey,
        connectedLoadThresholdKw: row.connectedLoadThresholdKw,
      };
    }
  } catch {
    // DB unavailable: fall through to the rules in code
  }

  const stateRule = ncrRuleFor(cityKey);
  if (stateRule) return stateRule;

  try {
    const defaultRow = await prisma.regulatoryPhasePolicy.findFirst({
      where: { cityKey: "DEFAULT", isActive: true },
      select: { cityKey: true, connectedLoadThresholdKw: true },
    });

    if (defaultRow) {
      return {
        cityKey,
        connectedLoadThresholdKw: defaultRow.connectedLoadThresholdKw,
      };
    }
  } catch {
    // DB unavailable: fall through to the hardcoded default
  }

  return { cityKey: "DEFAULT", connectedLoadThresholdKw: FALLBACK_DEFAULT_THRESHOLD_KW };
}
