// src/features/calculator/marketAudit.ts
// ============================================================================
// MARKET AUDIT
// ============================================================================
// Pure arithmetic behind the Market Audit pane: where the material money goes,
// and how far a quote someone has already been given sits above the reference
// price (the dealer rate). Materials only — labour is deliberately out of
// scope, because a labour figure is a negotiation over one person's day rate,
// while a material markup is a checkable fact against a price list.
// ============================================================================

import type { EnrichedBOMResult } from "./costEngine";

/**
 * How far over the reference price a quote can go and still be fair. Dealers
 * keep ~4–5% and retailers ~5–6% on house wire, so a buyer who shops around
 * pays ~10–12% over the dealer rate at the counter; 15% leaves room for
 * switchgear, which carries a wider margin.
 */
export const MARKUP_ALERT_THRESHOLD = 0.15;

type Pricing = EnrichedBOMResult["pricing"];

export interface SpendSlice {
  key: "cable" | "protection" | "conduit" | "accessories";
  label: string;
  amount: number;
  /** Fraction of trade material cost, 0–1. */
  share: number;
}

/** The four spend categories in a fixed order, largest-first by convention
    (cable dominates every residential job). Zero-spend slices are kept so the
    legend does not reshuffle between estimates. */
export function spendSplit(pricing: Pricing): SpendSlice[] {
  const total = pricing.wholesaleTradeEstimate;
  const slices: Omit<SpendSlice, "share">[] = [
    { key: "cable", label: "Cable", amount: pricing.cableCost },
    { key: "protection", label: "Protection", amount: pricing.protectionCost },
    { key: "conduit", label: "Conduit", amount: pricing.conduitCost },
    { key: "accessories", label: "Switches & Sockets", amount: pricing.accessoriesCost },
  ];
  return slices.map((s) => ({ ...s, share: total > 0 ? s.amount / total : 0 }));
}

/**
 * The most a fair quote for these materials should come to, in whole rupees.
 * auditQuote draws its line here too, so a buyer who types exactly the figure
 * the pane shows is told it is fair — the pane and the verdict never disagree
 * over a rounded paisa.
 */
export function fairCeiling(reference: number): number {
  return Math.round(reference * (1 + MARKUP_ALERT_THRESHOLD));
}

export type AuditVerdict =
  /** At or under the fair ceiling. */
  | "FAIR"
  /** Over the fair ceiling, still under MRP. */
  | "HIGH"
  /** At or above MRP — no discount passed on at all. */
  | "ABOVE_RETAIL"
  /** Below the reference — usually a cheaper brand, lower grade or short
      quantities. */
  | "BELOW_REFERENCE";

export interface AuditResult {
  /** (quote − reference) / reference. 0.23 means 23% over reference. */
  markupPct: number;
  verdict: AuditVerdict;
  /** Rupees over the fair ceiling, rounded up; 0 at or under it. */
  aboveCeiling: number;
}

/**
 * Positions a quoted material price against the reference price and MRP.
 * Returns null for anything that is not a positive, finite amount, so an
 * empty or half-typed input renders nothing rather than "-100%".
 */
export function auditQuote(
  quoted: number,
  reference: number,
  totalMrp: number
): AuditResult | null {
  if (!Number.isFinite(quoted) || quoted <= 0 || reference <= 0) return null;

  const markupPct = (quoted - reference) / reference;
  const ceiling = fairCeiling(reference);

  let verdict: AuditVerdict;
  if (quoted < reference) verdict = "BELOW_REFERENCE";
  else if (quoted >= totalMrp) verdict = "ABOVE_RETAIL";
  else if (quoted > ceiling) verdict = "HIGH";
  else verdict = "FAIR";

  // Rounded up, so a HIGH quote a few paise over never reads "₹0 above".
  return { markupPct, verdict, aboveCeiling: Math.max(0, Math.ceil(quoted - ceiling)) };
}
