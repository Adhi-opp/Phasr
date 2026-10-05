// src/features/calculator/boardEngine.ts
// ============================================================================
// DISTRIBUTION BOARD SCHEDULE
// ============================================================================
// Turns a circuit list into a board design: what breaker protects what, on
// which rail, behind which incomer.
//
// A BOM says "12 MCBs". Nobody can audit that. A schedule says "Way 4 —
// 16 A Type C, Kitchen 15 A sockets, 2.5 mm²", which a homeowner can hold up
// against the actual board and check. That is the whole point of this module.
//
// Pure. No database, no React, no Prisma — same contract as calculateBOM, so
// the seed, the specs and both UIs can all call it.
//
// ---------------------------------------------------------------------------
// A NOTE ON THE BREAKER TABLE
// ---------------------------------------------------------------------------
// The specified rule was "1.0 / 1.5 mm² → strictly 10 A Type C". Implemented
// literally that is unsafe in one direction and wrong in another, so it is
// implemented here as a CEILING rather than a fixed value:
//
//   * A rating below the ceiling is more protective, not less. calculateBOM's
//     lighting circuits come out at exactly 10 A Type B, the 1.5 mm² ceiling,
//     because they also carry 5 A sockets; but a lighting-only circuit
//     requested at 6 A must stay at 6 A. Forcing it up to 10 A would make it
//     LESS protected. This feature exists because breakers get over-specified;
//     raising a correctly-sized one would be the same bug with our name on it.
//     So the table caps a rating, and never raises one.
//
//   * Curve is derived from the circuit's own type, not forced to C. Type B
//     trips at 3–5x rated current, Type C at 5–10x. Lighting and general
//     sockets are resistive and belong on B; C exists for inductive inrush
//     (ACs, motors, cooking ranges) where a B curve would nuisance-trip.
//     Forcing lighting onto C would make it slower to trip on a fault.
//
// The ceiling is the safety rule and it is enforced hard: nothing is ever
// allowed to sit above the cap for its conductor, and every clamp is recorded
// in `corrections` so the UI can show what was changed and why.
// ============================================================================

import { CIRCUIT_TYPES, MAIN_SWITCH, WIRE_GAUGES } from "./constants";
import type { CircuitTypeKey, WireGaugeKey } from "./constants";
import type { CircuitDefinition } from "./type";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PhaseRail = "R" | "Y" | "B";
export type BreakerCurve = "B" | "C";

export interface BreakerCorrection {
  circuitId: string;
  requestedAmps: number;
  appliedAmps: number;
  reason: string;
}

export interface BoardWay {
  /** 1-based position on the busbar, in board order. */
  wayNumber: number;
  circuitId: string;
  circuitType: CircuitTypeKey;
  roomName: string;
  floor: number;
  pointDescription: string;
  wireGauge: WireGaugeKey;
  sizeSqMm: number;
  ratingAmps: number;
  curve: BreakerCurve;
  /** null on a single-phase board — there is only one line conductor. */
  rail: PhaseRail | null;
  correction: BreakerCorrection | null;
}

export interface RccbSpec {
  poles: 2 | 4;
  polesLabel: "DP" | "4P";
  ratingAmps: number;
  sensitivityMa: number;
}

export interface IncomerSpec {
  poles: 2 | 4;
  polesLabel: "DP" | "4P";
  ratingAmps: number;
  /** Computed design current the incomer has to carry, before rounding up. */
  designCurrentAmps: number;
  /** True when max demand pushed the incomer above the standard fitment. */
  upgradedFromStandard: boolean;
  rccb: RccbSpec;
}

export interface RailSummary {
  rail: PhaseRail;
  ways: BoardWay[];
  connectedAmps: number;
}

export interface BalanceSummary {
  maxRailAmps: number;
  minRailAmps: number;
  spreadAmps: number;
  /** Spread as a share of the heaviest rail. 0 is perfectly balanced. */
  spreadPct: number;
}

export interface DistributionSchedule {
  supply: "SINGLE" | "THREE";
  incomer: IncomerSpec;
  /** Board order. Every circuit, single- or three-phase. */
  ways: BoardWay[];
  /** Three entries on a three-phase board, empty on single-phase. */
  rails: RailSummary[];
  balance: BalanceSummary | null;
  totalConnectedAmps: number;
  waysUsed: number;
  /** Next standard enclosure that fits the ways plus spare capacity. */
  recommendedDbWays: number;
  corrections: BreakerCorrection[];
  warnings: string[];
}

export interface BoardEngineInput {
  circuits: CircuitDefinition[];
  supply: "SINGLE" | "THREE";
  maxDemandKw: number;
}

// ---------------------------------------------------------------------------
// Standards
// ---------------------------------------------------------------------------

/** Breakers you can actually buy. Nothing is emitted outside this list. */
const STANDARD_MCB_RATINGS = [6, 10, 16, 20, 25, 32, 40, 63] as const;

/**
 * Maximum breaker permitted on each conductor — the fire guard.
 *
 * A breaker above these values cannot be relied on to open before the
 * insulation is damaged by a sustained overload, which is the failure mode
 * behind "just put a 32 A on everything".
 *
 * Each cap sits at or below the conductor's ampacity in WIRE_GAUGES.
 * calculateBOM sizes the main feeder against it too, so the cable from the
 * meter is never smaller than the main breaker it feeds.
 */
export const MAX_BREAKER_FOR_GAUGE: Record<WireGaugeKey, number> = {
  "1.0": 10, // ampacity 10 A
  "1.5": 10, // ampacity 15 A
  "2.5": 16, // ampacity 20 A
  "4.0": 25, // ampacity 27 A
  "6.0": 32, // ampacity 34 A
  "10.0": 40, // ampacity 46 A
  "16.0": 63, // ampacity 61 A — 63 A is the standard fitment at this size
};

/** Enclosure sizes sold in NCR. */
const STANDARD_DB_WAYS = [4, 6, 8, 12, 16, 18, 24, 32] as const;

/** Spare ways left for later additions — an EV point, an inverter changeover. */
const SPARE_WAYS = 2;

/** Incomer / RCCB fitments you can buy. */
const STANDARD_INCOMER_RATINGS = [32, 40, 63, 80, 100] as const;

const SINGLE_PHASE_VOLTS = 230;
const THREE_PHASE_LINE_VOLTS = 415;
const RCCB_SENSITIVITY_MA = 30;

/**
 * Standard residential fitments: the BOM's main switch (MAIN_SWITCH), so the
 * schedule and the parts list can never disagree. They also match RCCB_SPECS.
 */
const BASE_INCOMER_AMPS = {
  SINGLE: MAIN_SWITCH.SINGLE_PHASE.ratingAmps,
  THREE: MAIN_SWITCH.THREE_PHASE.ratingAmps,
} as const;

const RAILS: readonly PhaseRail[] = ["R", "Y", "B"] as const;

// ---------------------------------------------------------------------------
// Breaker enforcement
// ---------------------------------------------------------------------------

/** Largest standard rating not exceeding `cap`. */
function largestStandardAtOrBelow(cap: number): number {
  let best: number = STANDARD_MCB_RATINGS[0];
  for (const rating of STANDARD_MCB_RATINGS) {
    if (rating <= cap) best = rating;
  }
  return best;
}

/**
 * Curve for a circuit, from its type rather than a blanket rule.
 *
 * B = 3–5x trip, for resistive loads. C = 5–10x, for inductive inrush.
 * Unknown types fall back to C: on an unrecognised circuit the safer failure
 * is a breaker that does not nuisance-trip, since the ceiling above already
 * bounds the thermal risk.
 */
function curveFor(circuitType: CircuitTypeKey): BreakerCurve {
  const spec = CIRCUIT_TYPES[circuitType];
  return spec?.mcbType === "B" ? "B" : "C";
}

/**
 * Applies the conductor ceiling.
 *
 * Clamps down, never up. A rating below the cap is already more protective
 * than required and is left exactly as the engine chose it.
 */
export function enforceBreaker(
  circuitId: string,
  wireGauge: WireGaugeKey,
  requestedAmps: number
): { ratingAmps: number; correction: BreakerCorrection | null } {
  const cap = MAX_BREAKER_FOR_GAUGE[wireGauge];

  if (cap === undefined) {
    // Unknown conductor: fall back to the most conservative breaker we sell
    // rather than trusting a rating we cannot check against an ampacity.
    return {
      ratingAmps: Math.min(requestedAmps, STANDARD_MCB_RATINGS[0]),
      correction: {
        circuitId,
        requestedAmps,
        appliedAmps: STANDARD_MCB_RATINGS[0],
        reason: `Unrecognised conductor size — defaulted to the smallest available breaker.`,
      },
    };
  }

  if (requestedAmps <= cap) {
    return { ratingAmps: requestedAmps, correction: null };
  }

  const applied = largestStandardAtOrBelow(cap);
  const sizeSqMm = WIRE_GAUGES[wireGauge]?.sizeSqMm ?? 0;

  return {
    ratingAmps: applied,
    correction: {
      circuitId,
      requestedAmps,
      appliedAmps: applied,
      reason: `${sizeSqMm.toFixed(1)} mm² conductor cannot be protected above ${cap} A — reduced from ${requestedAmps} A.`,
    },
  };
}

// ---------------------------------------------------------------------------
// Incomer
// ---------------------------------------------------------------------------

function roundUpToIncomer(amps: number): number {
  for (const rating of STANDARD_INCOMER_RATINGS) {
    if (rating >= amps) return rating;
  }
  return STANDARD_INCOMER_RATINGS[STANDARD_INCOMER_RATINGS.length - 1];
}

/**
 * Sizes the incomer from maximum demand, never below the standard fitment.
 *
 * Single phase: I = P / V.
 * Three phase:  I = P / (root-3 x V_line).
 */
export function sizeIncomer(
  supply: "SINGLE" | "THREE",
  maxDemandKw: number
): IncomerSpec {
  const watts = Math.max(0, maxDemandKw) * 1000;

  const designCurrentAmps =
    supply === "THREE"
      ? watts / (Math.sqrt(3) * THREE_PHASE_LINE_VOLTS)
      : watts / SINGLE_PHASE_VOLTS;

  const base = BASE_INCOMER_AMPS[supply];
  const required = roundUpToIncomer(designCurrentAmps);
  const ratingAmps = Math.max(base, required);

  const poles = supply === "THREE" ? 4 : 2;
  const polesLabel = supply === "THREE" ? "4P" : "DP";

  return {
    poles,
    polesLabel,
    ratingAmps,
    designCurrentAmps: Math.round(designCurrentAmps * 10) / 10,
    upgradedFromStandard: ratingAmps > base,
    rccb: {
      poles,
      polesLabel,
      // The RCCB carries the whole board, so it matches the incomer.
      ratingAmps,
      sensitivityMa: RCCB_SENSITIVITY_MA,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase balancing
// ---------------------------------------------------------------------------

/**
 * Greedy longest-processing-time assignment: heaviest breaker first, onto
 * whichever rail is currently lightest.
 *
 * LPT is not optimal in general, but it is within 4/3 of optimal and — more
 * importantly here — it is deterministic and explainable. A homeowner can
 * follow "biggest first, onto the emptiest rail" down the printed schedule
 * and verify it by hand. An optimal solver they cannot check is worse.
 *
 * Ties break on rail order (R, then Y, then B) and then on circuitId, so the
 * same input always produces the same board.
 */
function assignRails(ways: BoardWay[]): Map<string, PhaseRail> {
  const sorted = [...ways].sort(
    (a, b) =>
      b.ratingAmps - a.ratingAmps || a.circuitId.localeCompare(b.circuitId)
  );

  const load: Record<PhaseRail, number> = { R: 0, Y: 0, B: 0 };
  const assignment = new Map<string, PhaseRail>();

  for (const way of sorted) {
    let target: PhaseRail = RAILS[0];
    for (const rail of RAILS) {
      if (load[rail] < load[target]) target = rail;
    }
    assignment.set(way.circuitId, target);
    load[target] += way.ratingAmps;
  }

  return assignment;
}

// ---------------------------------------------------------------------------
// Board sizing
// ---------------------------------------------------------------------------

function recommendDbWays(waysUsed: number): number {
  const needed = waysUsed + SPARE_WAYS;
  for (const size of STANDARD_DB_WAYS) {
    if (size >= needed) return size;
  }
  return STANDARD_DB_WAYS[STANDARD_DB_WAYS.length - 1];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Builds the distribution schedule.
 *
 * Board order groups by floor then by circuit id, which is how a board is
 * physically wired — ground-floor circuits on the lower rows, upper floors
 * above — rather than by the order the calculator happened to emit them.
 */
export function buildDistributionSchedule(
  input: BoardEngineInput
): DistributionSchedule {
  const { circuits, supply, maxDemandKw } = input;
  const warnings: string[] = [];
  const corrections: BreakerCorrection[] = [];

  const ordered = [...circuits].sort(
    (a, b) => a.floor - b.floor || a.circuitId.localeCompare(b.circuitId)
  );

  const ways: BoardWay[] = ordered.map((circuit, index) => {
    const { ratingAmps, correction } = enforceBreaker(
      circuit.circuitId,
      circuit.wireGauge,
      circuit.mcbRatingAmps
    );

    if (correction) corrections.push(correction);

    return {
      wayNumber: index + 1,
      circuitId: circuit.circuitId,
      circuitType: circuit.circuitType,
      roomName: circuit.roomName,
      floor: circuit.floor,
      pointDescription: circuit.pointDescription,
      wireGauge: circuit.wireGauge,
      sizeSqMm: WIRE_GAUGES[circuit.wireGauge]?.sizeSqMm ?? 0,
      ratingAmps,
      curve: curveFor(circuit.circuitType),
      rail: null,
      correction,
    };
  });

  let rails: RailSummary[] = [];
  let balance: BalanceSummary | null = null;

  if (supply === "THREE" && ways.length > 0) {
    const assignment = assignRails(ways);
    for (const way of ways) {
      way.rail = assignment.get(way.circuitId) ?? "R";
    }

    rails = RAILS.map((rail) => {
      const railWays = ways.filter((w) => w.rail === rail);
      return {
        rail,
        ways: railWays,
        connectedAmps: railWays.reduce((sum, w) => sum + w.ratingAmps, 0),
      };
    });

    const amps = rails.map((r) => r.connectedAmps);
    const maxRailAmps = Math.max(...amps);
    const minRailAmps = Math.min(...amps);
    const spreadAmps = maxRailAmps - minRailAmps;

    balance = {
      maxRailAmps,
      minRailAmps,
      spreadAmps,
      spreadPct:
        maxRailAmps > 0 ? Math.round((spreadAmps / maxRailAmps) * 1000) / 10 : 0,
    };

    // Past roughly a fifth, the imbalance is usually structural — one very
    // large dedicated load that cannot be split across rails — and is worth
    // saying out loud rather than leaving the installer to notice.
    if (balance.spreadPct > 20) {
      warnings.push(
        `Rail loading is uneven by ${balance.spreadAmps} A (${balance.spreadPct}%). This is usually a single large dedicated circuit that cannot be divided; confirm the utility is content with the imbalance.`
      );
    }
  }

  const totalConnectedAmps = ways.reduce((sum, w) => sum + w.ratingAmps, 0);
  const waysUsed = ways.length;

  if (corrections.length > 0) {
    warnings.push(
      `${corrections.length} breaker${corrections.length === 1 ? "" : "s"} exceeded the rating its cable can carry and ${corrections.length === 1 ? "was" : "were"} reduced. Do not refit the larger size.`
    );
  }

  if (supply === "THREE" && ways.length > 0 && ways.length < 3) {
    warnings.push(
      "Fewer circuits than phases — a three-phase supply cannot be balanced meaningfully at this size."
    );
  }

  return {
    supply,
    incomer: sizeIncomer(supply, maxDemandKw),
    ways,
    rails,
    balance,
    totalConnectedAmps,
    waysUsed,
    recommendedDbWays: recommendDbWays(waysUsed),
    corrections,
    warnings,
  };
}
