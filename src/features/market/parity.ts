// src/features/market/parity.ts
// ============================================================================
// INDIAN COPPER PARITY
// ============================================================================
// The daily cron's formula. A baseline before GST, which applies separately
// at invoicing:
//
//   ₹/kg = COMEX US$/lb × lb per kg × ₹ per US$ × INDIA_PREMIUM_MULTIPLIER
//
// Import duty is deliberately not modelled: it is a factory-side cost, and a
// dealer prices against the domestic baseline.
//
// decideParity() is the cron's whole judgement, kept pure so the specs can
// pin it. It records a rate only from fresh, plausible inputs, and otherwise
// keeps the last rate, which the page shows with its date:
//   - refuse: an input or the result is outside any plausible range (a broken
//     feed or a unit change), or the result jumps more than 12% from the last
//     recorded rate.
//   - skip:   COMEX has not traded for 6 hours (a weekend or US holiday), or
//     a parity rate was already recorded in the last 12 hours (Vercel can
//     deliver a cron call twice).
//
// The jump guard is not only for glitches. COMEX is a US market and can
// split from LME, which Indian prices follow: in July 2025 US tariff news
// held COMEX about 20% above LME for weeks. A move like that is refused,
// not published.
// ============================================================================

import { COPPER_RATE_MAX_PER_KG, COPPER_RATE_MIN_PER_KG } from "../admin/priceSnapshot";

/** 1 lb is exactly 0.45359237 kg (the international avoirdupois pound). */
export const LB_PER_KG = 1 / 0.45359237;

/**
 * Calibrated to track MCX. On 2 Oct 2026 COMEX × USD/INR alone came to
 * ₹1,391/kg against MCX around ₹1,400; 1.01 lands on ₹1,405. (1.05 would
 * have read about 4% above MCX and inflated every estimate built on it.)
 */
export const INDIA_PREMIUM_MULTIPLIER = 1.01;

/** Outside these the feed has broken or changed units; the market has not moved. */
export const COMEX_USD_PER_LB_RANGE = { min: 1, max: 20 } as const;
export const USD_INR_RANGE = { min: 60, max: 150 } as const;

/** COMEX trades almost round the clock on weekdays; an older quote means it is closed. */
export const MAX_QUOTE_AGE_HOURS = 6;

/** A second call inside this window is a duplicate delivery, not a new day. */
export const MIN_HOURS_BETWEEN_RECORDS = 12;

/** Largest move accepted against the last rate recorded within MOVE_LOOKBACK_DAYS. */
export const MAX_MOVE_FROM_LAST = 0.12;
export const MOVE_LOOKBACK_DAYS = 7;

const HOUR_MS = 3_600_000;

/** Exact conversion, unrounded and before the premium. */
export function inrPerKgFromUsdPerLb(usdPerLb: number, usdInr: number): number {
  return usdPerLb * LB_PER_KG * usdInr;
}

/** The figure the cron records: whole rupees per kg, premium applied. */
export function parityRupeesPerKg(usdPerLb: number, usdInr: number): number {
  return Math.round(inrPerKgFromUsdPerLb(usdPerLb, usdInr) * INDIA_PREMIUM_MULTIPLIER);
}

export type ParityDecision =
  | { action: "record"; rate: number }
  | { action: "skip"; reason: string }
  | { action: "refuse"; reason: string };

function inRange(value: number, range: { min: number; max: number }): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

export function decideParity({
  usdPerLb,
  usdInr,
  quoteTime,
  now,
  latest,
  lastParityAt,
}: {
  usdPerLb: number;
  usdInr: number;
  /** When COMEX last traded. */
  quoteTime: Date;
  now: Date;
  /** The newest rate from any source, or null if none exists. */
  latest: { rate: number; effectiveDate: Date } | null;
  /** When the cron last recorded a parity rate, or null. */
  lastParityAt: Date | null;
}): ParityDecision {
  if (!inRange(usdPerLb, COMEX_USD_PER_LB_RANGE)) {
    return {
      action: "refuse",
      reason: `COMEX copper at US$${usdPerLb}/lb is outside US$${COMEX_USD_PER_LB_RANGE.min}–${COMEX_USD_PER_LB_RANGE.max}; the feed is broken or has changed units.`,
    };
  }
  if (!inRange(usdInr, USD_INR_RANGE)) {
    return {
      action: "refuse",
      reason: `USD/INR at ${usdInr} is outside ${USD_INR_RANGE.min}–${USD_INR_RANGE.max}; the feed is broken or inverted.`,
    };
  }

  const quoteAgeHours = (now.getTime() - quoteTime.getTime()) / HOUR_MS;
  if (quoteAgeHours > MAX_QUOTE_AGE_HOURS) {
    return {
      action: "skip",
      reason: `COMEX has not traded for ${Math.round(quoteAgeHours)} hours (weekend or US holiday); the last rate stands.`,
    };
  }

  if (lastParityAt && now.getTime() - lastParityAt.getTime() < MIN_HOURS_BETWEEN_RECORDS * HOUR_MS) {
    return {
      action: "skip",
      reason: `A parity rate was already recorded in the last ${MIN_HOURS_BETWEEN_RECORDS} hours.`,
    };
  }

  const rate = parityRupeesPerKg(usdPerLb, usdInr);
  if (rate < COPPER_RATE_MIN_PER_KG || rate > COPPER_RATE_MAX_PER_KG) {
    return {
      action: "refuse",
      reason: `₹${rate}/kg is outside ₹${COPPER_RATE_MIN_PER_KG}–${COPPER_RATE_MAX_PER_KG}.`,
    };
  }

  const lookbackMs = MOVE_LOOKBACK_DAYS * 24 * HOUR_MS;
  if (latest && now.getTime() - latest.effectiveDate.getTime() <= lookbackMs) {
    const move = (rate - latest.rate) / latest.rate;
    if (Math.abs(move) > MAX_MOVE_FROM_LAST) {
      const pct = `${move > 0 ? "+" : "−"}${(Math.abs(move) * 100).toFixed(1)}%`;
      return {
        action: "refuse",
        reason: `₹${rate}/kg is ${pct} from the last recorded ₹${latest.rate}/kg, beyond the ${MAX_MOVE_FROM_LAST * 100}% limit. Check the benchmark, then record today's rate on /admin by hand.`,
      };
    }
  }

  return { action: "record", rate };
}
