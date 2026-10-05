// src/features/calculator/regulatoryPolicy.ts
// ============================================================================
// SINGLE- OR THREE-PHASE SUPPLY: THE STATE RULE
// ============================================================================
// Above a load set by each state's electricity regulator, the DISCOM supplies
// three phase, not single. NCR spans three states and they do not agree:
//
//   Delhi    DERC   single phase up to 10 kW; three phase above 10 kW.
//            DERC Schedule of Charges and Procedure, under the DERC (Supply
//            Code and Performance Standards) Regulations, 2017. BSES Rajdhani,
//            BSES Yamuna, Tata Power-DDL and NDMC all apply it.
//   Haryana  HERC   single phase up to 5 kW; three phase above 5 kW.
//            HERC (Electricity Supply Code) Regulations, 2014, Reg. 3.2.1 as
//            amended Nov 2014 (DHBVN Sales Circular D-48/2014). Gurugram and
//            Faridabad are DHBVN.
//   UP       UPERC  single phase below 5 kW; three phase at 5 kW or more.
//            UP Electricity Supply Code, 2005 (as amended), clause 3.2.
//            Noida, Greater Noida and Ghaziabad.
//
// The regulations count contracted or sanctioned load. The engine uses the
// house's connected load as the stand-in, which is what a DISCOM inspects
// against. NCR without a city (older saved estimates) is treated as Delhi.
// Anywhere else falls back to 7 kW, a generic engineering threshold, not a
// regulation.
//
// Pure and synchronous: calculateBOM calls it, and a client form imports
// NCR_CITY_OPTIONS from here.
// ============================================================================

import type { CalculatorInput } from "./type";

export interface RegulatoryPolicyResult {
  cityKey: string;
  connectedLoadThresholdKw: number;
  /** True where the rule reads "N kW or more" (UP), false for "above N kW". */
  threePhaseAtThreshold?: boolean;
  /** Whose rule it is, for messages: "Delhi (DERC)". Absent for a rule with no named authority. */
  authority?: string;
}

interface StateRule {
  thresholdKw: number;
  threePhaseAtThreshold: boolean;
  authority: string;
}

const DELHI: StateRule = { thresholdKw: 10, threePhaseAtThreshold: false, authority: "Delhi (DERC)" };
const HARYANA: StateRule = { thresholdKw: 5, threePhaseAtThreshold: false, authority: "Haryana (HERC)" };
const UTTAR_PRADESH: StateRule = { thresholdKw: 5, threePhaseAtThreshold: true, authority: "Uttar Pradesh (UPERC)" };

const NCR_RULES: Record<string, StateRule> = {
  NCR: DELHI,
  DELHI: DELHI,
  "NEW DELHI": DELHI,
  GURUGRAM: HARYANA,
  GURGAON: HARYANA,
  FARIDABAD: HARYANA,
  NOIDA: UTTAR_PRADESH,
  "GREATER NOIDA": UTTAR_PRADESH,
  GHAZIABAD: UTTAR_PRADESH,
};

const DEFAULT_CONNECTED_LOAD_THRESHOLD_KW = 7;

/** The cities the calculator offers, in the order it lists them. Delhi first, as the default. */
export const NCR_CITY_OPTIONS = [
  "Delhi",
  "Gurugram",
  "Faridabad",
  "Noida",
  "Greater Noida",
  "Ghaziabad",
] as const;

export function normalizeCityKey(city: string): string {
  return city.replace(/\s+/g, " ").trim().toUpperCase();
}

export function isNcrCityKey(cityKey: string): boolean {
  return Object.hasOwn(NCR_RULES, normalizeCityKey(cityKey));
}

/** The state rule for an NCR city, or null for anywhere else. */
export function ncrRuleFor(cityKey: string): RegulatoryPolicyResult | null {
  const key = normalizeCityKey(cityKey);
  if (!Object.hasOwn(NCR_RULES, key)) return null;
  const rule = NCR_RULES[key];
  return {
    cityKey: key,
    connectedLoadThresholdKw: rule.thresholdKw,
    threePhaseAtThreshold: rule.threePhaseAtThreshold,
    authority: rule.authority,
  };
}

/** True when a connected load needs three-phase supply under this rule. */
export function exceedsSinglePhaseLimit(connectedLoadKw: number, policy: RegulatoryPolicyResult): boolean {
  return policy.threePhaseAtThreshold
    ? connectedLoadKw >= policy.connectedLoadThresholdKw
    : connectedLoadKw > policy.connectedLoadThresholdKw;
}

/** "Delhi (DERC) supplies three phase above 10 kW of connected load", for warnings. */
export function describeSupplyRule(policy: RegulatoryPolicyResult): string {
  const who = policy.authority ?? `the ${policy.cityKey} DISCOM threshold`;
  const verb = policy.authority ? "supplies three phase" : "calls for three phase";
  const where = policy.threePhaseAtThreshold ? "from" : "above";
  return `${who} ${verb} ${where} ${policy.connectedLoadThresholdKw} kW of connected load`;
}

/**
 * Pure/synchronous resolver, called by calculateBOM when no rule was loaded
 * from the database first.
 */
export function resolveRegulatoryPhasePolicy(input: CalculatorInput): RegulatoryPolicyResult {
  return (
    ncrRuleFor(input.city || "NCR") ?? {
      cityKey: "DEFAULT",
      connectedLoadThresholdKw: DEFAULT_CONNECTED_LOAD_THRESHOLD_KW,
    }
  );
}

/** Hardcoded fallback, exported for the DB loader. */
export const FALLBACK_DEFAULT_THRESHOLD_KW = DEFAULT_CONNECTED_LOAD_THRESHOLD_KW;
