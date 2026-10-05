// src/features/calculator/costEngine.ts
// ============================================================================
// COST ENGINE — materials only
// ============================================================================
// Phasr prices what gets bought, never who installs it. Labour is a
// negotiation over one person's day rate; a material price is checkable
// against a dealer's list, and that is the only claim this engine makes.
// ============================================================================

import type { BOMItem, BOMResult, PricingCode } from "./type";

type RateBasis = "per_meter" | "per_piece";
type RateSource = "FINAL" | "PROVISIONAL";

interface RateCardEntry {
  rate: number;
  basis: RateBasis;
  source: RateSource;
}

export class PricingDataError extends Error {
  readonly code = "PRICING_DATA_MISSING";
  readonly missingCodes: PricingCode[];

  constructor(missingCodes: PricingCode[]) {
    super(`Missing pricing data for codes: ${missingCodes.join(", ")}`);
    this.name = "PricingDataError";
    this.missingCodes = missingCodes;
  }
}

/**
 * Discount off printed MRP at which a dealer buys, by spend category.
 *
 * RATE_CARD (and PriceIndex) hold that dealer rate — the reference price — so
 * MRP is derived by grossing each line up — trade / (1 − discount) — never by
 * discounting the rate card again, which would double-count the discount.
 *
 *   cable  37%  Dealer net on branded house wire runs roughly 30–40% below
 *               MRP (derived from the Technopak channel study in RR Kabel's
 *               2023 IPO filing). 37% puts the derived MRP on the printed
 *               price of Polycab Etira FR 90 m coils in Sep 2026: ₹3,690 for
 *               1.5 sq mm, ₹5,890 for 2.5 sq mm.
 *   other  25%  Switchgear (MCB/RCCB/DB), conduit and wiring accessories. No
 *               sourced channel data; the midpoint of the 20–30% dealers
 *               typically quote. Unverified.
 */
export const TRADE_DISCOUNT = {
  cable: 0.37,
  other: 0.25,
} as const;

/** When the cable rates below were last checked against printed MRPs. Copper
    moves list prices every few weeks, so a reference price is shown with
    its date or not at all. */
export const CABLE_RATES_AS_OF = "Sep 2026";

/** Where the material money goes. Every priced line lands in exactly one. */
export type SpendCategory = "cable" | "protection" | "conduit" | "accessories";

function spendCategoryOf(item: BOMItem): SpendCategory {
  switch (item.category) {
    case "WIRE":
    case "EARTH_WIRE":
      return "cable";
    case "MCB":
    case "RCCB":
    case "MAIN_SWITCH":
    case "DB":
      return "protection";
    case "CONDUIT":
      return "conduit";
    case "SWITCHGEAR":
      return "accessories";
  }
}

export type EnrichedBOMResult = BOMResult & {
  // Every saved project's bomData is a stored copy of this object, and the
  // dashboards read materialCost from it — so materialCost keeps its name.
  // Rows saved before labour was removed still carry laborCost,
  // totalEstimate and the grade range; nothing reads them any more.
  pricing: {
    /** Material cost at dealer trade rates. */
    materialCost: number;
    surplusMetersTotal: number;
    surplusValueTotal: number;

    /** The same figure as materialCost: the reference price every quote is
        measured against in the market audit. */
    wholesaleTradeEstimate: number;
    /** The same materials at printed MRP, whole rupees. A ceiling price that
        is rarely paid in full, never a savings baseline. */
    totalMrp: number;
    /** Trade-rate spend by category; the four sum to materialCost. */
    cableCost: number;
    protectionCost: number;
    conduitCost: number;
    /** Modular switches, sockets and regulators. */
    accessoriesCost: number;
  };
};

export const RATE_CARD: Record<PricingCode, RateCardEntry> = {
  // Wires (Per Meter) — printed MRP per metre × (1 − TRADE_DISCOUNT.cable).
  // 1.5 and 2.5 come from quoted MRPs. 4.0 and up scale the MRP by copper
  // cross-section (~₹9,300 and ~₹13,800 per 90 m coil for 4.0 and 6.0),
  // derived rather than quoted, so PROVISIONAL.
  WIRE_1_5: { rate: 26, basis: "per_meter", source: "FINAL" },
  WIRE_2_5: { rate: 41, basis: "per_meter", source: "FINAL" },
  WIRE_4_0: { rate: 65, basis: "per_meter", source: "PROVISIONAL" },
  WIRE_6_0: { rate: 97, basis: "per_meter", source: "PROVISIONAL" },
  WIRE_10_0: { rate: 161, basis: "per_meter", source: "PROVISIONAL" },
  WIRE_16_0: { rate: 258, basis: "per_meter", source: "PROVISIONAL" },
  EARTH_WIRE_2_5: { rate: 41, basis: "per_meter", source: "FINAL" },

  // Conduits (Per Meter)
  CONDUIT_20: { rate: 35, basis: "per_meter", source: "FINAL" },
  CONDUIT_25: { rate: 48, basis: "per_meter", source: "FINAL" },
  CONDUIT_32: { rate: 65, basis: "per_meter", source: "FINAL" },

  // Switchgear & Breakers (Per Piece)
  MCB_10A_B: { rate: 350, basis: "per_piece", source: "FINAL" },
  MCB_16A_C: { rate: 380, basis: "per_piece", source: "FINAL" },
  MCB_20A_C: { rate: 420, basis: "per_piece", source: "FINAL" },
  MCB_32A_C: { rate: 650, basis: "per_piece", source: "FINAL" },
  // 40 A parts: estimated from the 32 A and 63 A rates beside them, not
  // quoted, so PROVISIONAL until a dealer price replaces them.
  MCB_40A_C: { rate: 700, basis: "per_piece", source: "PROVISIONAL" },
  MCB_63A_C: { rate: 950, basis: "per_piece", source: "PROVISIONAL" },
  RCCB_40A_2P_30MA: { rate: 1800, basis: "per_piece", source: "FINAL" },
  RCCB_63A_4P_30MA: { rate: 3600, basis: "per_piece", source: "PROVISIONAL" },
  // Kept so BOMs saved before the 40 A main can still be priced; the engine
  // no longer emits it.
  MAIN_SWITCH_32A_DP: { rate: 1200, basis: "per_piece", source: "FINAL" },
  MAIN_SWITCH_40A_DP: { rate: 1300, basis: "per_piece", source: "PROVISIONAL" },
  MAIN_SWITCH_63A_FP: { rate: 2400, basis: "per_piece", source: "PROVISIONAL" },
  DB_GENERIC: { rate: 3200, basis: "per_piece", source: "FINAL" },

  // Devices (Per Piece)
  SWITCH_MODULAR_6A_10A: { rate: 120, basis: "per_piece", source: "FINAL" },
  SOCKET_5A_2M: { rate: 180, basis: "per_piece", source: "FINAL" },
  SOCKET_15A_16A_3M: { rate: 320, basis: "per_piece", source: "FINAL" },
  FAN_REGULATOR_2M: { rate: 450, basis: "per_piece", source: "FINAL" },
};

function getMeterQuantity(item: BOMItem): number {
  if (item.category === "WIRE" || item.category === "EARTH_WIRE" || item.category === "CONDUIT") {
    return item.totalMeters;
  }
  return 0;
}

function getPieceQuantity(item: BOMItem): number {
  if (
    item.category === "MCB" ||
    item.category === "RCCB" ||
    item.category === "MAIN_SWITCH" ||
    item.category === "DB" ||
    item.category === "SWITCHGEAR"
  ) {
    return item.quantity;
  }
  return 0;
}

export type RateCard = Record<PricingCode, RateCardEntry>;

export function applyPricing(
  result: BOMResult,
  rateCard: RateCard = RATE_CARD
): EnrichedBOMResult {
  let materialCost = 0;
  let surplusMetersTotal = 0;
  let surplusValueTotal = 0;
  let totalMrp = 0;
  const spend: Record<SpendCategory, number> = {
    cable: 0,
    protection: 0,
    conduit: 0,
    accessories: 0,
  };
  const missingCodes = new Set<PricingCode>();

  for (const item of result.items) {
    const priceConfig = rateCard[item.pricingCode];

    if (!priceConfig || priceConfig.rate <= 0) {
      missingCodes.add(item.pricingCode);
      continue;
    }

    const lineCost =
      priceConfig.basis === "per_meter"
        ? priceConfig.rate * getMeterQuantity(item)
        : priceConfig.rate * getPieceQuantity(item);

    const category = spendCategoryOf(item);
    materialCost += lineCost;
    spend[category] += lineCost;
    totalMrp +=
      lineCost /
      (1 - (category === "cable" ? TRADE_DISCOUNT.cable : TRADE_DISCOUNT.other));

    if (item.category === "WIRE" || item.category === "EARTH_WIRE") {
      surplusMetersTotal += item.surplusMeters;
      surplusValueTotal += item.surplusMeters * priceConfig.rate;
    }
  }

  if (missingCodes.size > 0) {
    throw new PricingDataError(Array.from(missingCodes).sort());
  }

  return {
    ...result,
    pricing: {
      materialCost,
      surplusMetersTotal,
      surplusValueTotal,
      wholesaleTradeEstimate: materialCost,
      totalMrp: Math.round(totalMrp),
      cableCost: spend.cable,
      protectionCost: spend.protection,
      conduitCost: spend.conduit,
      accessoriesCost: spend.accessories,
    },
  };
}
