// src/features/calculator/types.ts
// ============================================================================
// TYPE DEFINITIONS FOR IS 732 COMPLIANT BOM CALCULATOR
// ============================================================================
// These types define the data structures flowing through the calculator.
// Input: What the user provides (rooms, dimensions, appliances)
// Output: What the algorithm produces (wire quantities, MCBs, conduit, DB)
// ============================================================================

import type { RoomTypeKey, CircuitTypeKey, WireGaugeKey } from "./constants";

// ---------------------------------------------------------------------------
// INPUT TYPES — What the user fills in the calculator form
// ---------------------------------------------------------------------------

export interface RoomSpec {
  id: string;
  name: string;                   // "Bedroom 1", "Master Bedroom", "Kitchen"
  type: RoomTypeKey;              // maps to ROOM_DEFAULTS for auto-fill
  floor: number;                  // 0 = ground, 1 = first, etc.

  // Dimensions (in feet — Indian standard for residential)
  lengthFt: number;
  widthFt: number;

  // Electrical points — pre-filled from ROOM_DEFAULTS, user can override
  lightPoints: number;
  fanPoints: number;
  socket5A: number;
  socket15A: number;
  heavyAppliances: number;        // ACs, geysers — each gets a dedicated circuit
  exhaustFan: number;

  // Optional overrides
  hasCookingRange?: boolean;      // needs dedicated 6.0 sq mm circuit
  customDbDistanceMeters?: number; // override default DB distance
}

export interface CalculatorInput {
  projectName: string;
  propertyType: "RESIDENTIAL" | "COMMERCIAL";
  city: string;                    // for RFQ geo-targeting later
  pincode: string;

  totalFloors: number;
  rooms: RoomSpec[];

  // Electrical supply
  supplyPhase: "SINGLE" | "THREE"; // user selects, or auto-recommended
  dbLocation: "NEAR_ENTRANCE" | "UTILITY_AREA" | "CUSTOM";
  dbFloor: number;                 // which floor the main DB is on

  // Preferences
  wireBrand?: string;              // preferred brand for pricing (optional)
  conduitType?: "PVC" | "METAL";   // PVC is default for residential
}

// ---------------------------------------------------------------------------
// INTERMEDIATE TYPES — Used during calculation
// ---------------------------------------------------------------------------

export interface CircuitDefinition {
  circuitId: string;               // "LT-GF-BR1-1" (Lighting-GroundFloor-Bedroom1-Circuit1)
  circuitType: CircuitTypeKey;
  roomId: string;
  roomName: string;
  floor: number;

  wireGauge: WireGaugeKey;
  mcbRatingAmps: number;

  // Points served by this circuit
  pointCount: number;
  pointDescription: string;        // "3 lights, 1 fan"

  // Calculated wire length for this circuit (in meters, before safety margin)
  wireLengthMeters: number;
  conduitLengthMeters: number;

  /**
   * Route length from the DB to this circuit's farthest point, which is what
   * the voltage-drop check measures. Shorter than wireLengthMeters on a shared
   * circuit, which totals every point's run. Absent on BOMs saved before Oct 2026.
   */
  farthestPointMeters?: number;
}

export interface LoadBreakdown {
  roomId: string;
  roomName: string;
  lightingLoadWatts: number;
  powerLoadWatts: number;
  heavyLoadWatts: number;
  totalConnectedLoadWatts: number;
  diversifiedDemandWatts: number;  // after applying diversity factor
}

// ---------------------------------------------------------------------------
// OUTPUT TYPES — The BOM result
// ---------------------------------------------------------------------------

export type PricingCode =
  | "WIRE_1_5"
  | "WIRE_2_5"
  | "WIRE_4_0"
  | "WIRE_6_0"
  | "WIRE_10_0"
  | "WIRE_16_0"
  | "EARTH_WIRE_2_5"
  | "CONDUIT_20"
  | "CONDUIT_25"
  | "CONDUIT_32"
  | "MCB_10A_B"
  | "MCB_16A_C"
  | "MCB_20A_C"
  | "MCB_32A_C"
  | "MCB_40A_C"
  | "MCB_63A_C"
  | "RCCB_40A_2P_30MA"
  | "RCCB_63A_4P_30MA"
  | "MAIN_SWITCH_32A_DP" // legacy: only in BOMs saved before the 40 A main (Oct 2026)
  | "MAIN_SWITCH_40A_DP"
  | "MAIN_SWITCH_63A_FP"
  | "DB_GENERIC"
  | "SWITCH_MODULAR_6A_10A"
  | "SOCKET_5A_2M"
  | "SOCKET_15A_16A_3M"
  | "FAN_REGULATOR_2M";

export interface BOMWireItem {
  category: "WIRE";
  pricingCode: PricingCode;
  wireGauge: WireGaugeKey;
  sizeSqMm: number;
  description: string;             // "1.5 sq mm FR PVC Copper Wire (Lighting)"
  totalMeters: number;             // exact meters needed (with safety margin)
  purchasableMeters: number;       // full-coil purchase quantity
  surplusMeters: number;           // purchasableMeters - totalMeters
  coilsRequired: number;           // rounded up to full coils
  coilLengthMeters: number;        // coil size for this gauge
  estimatedCostPerMeter?: number;  // from PriceIndex if available
  estimatedTotalCost?: number;
}

export interface BOMEarthWireItem {
  category: "EARTH_WIRE";
  pricingCode: PricingCode;
  sizeSqMm: number;
  description: string;
  totalMeters: number;
  purchasableMeters: number;
  surplusMeters: number;
  coilsRequired: number;
  coilLengthMeters: number;
  estimatedCostPerMeter?: number;
  estimatedTotalCost?: number;
}

export interface BOMMCBItem {
  category: "MCB";
  pricingCode: PricingCode;
  ratingAmps: number;
  type: "B" | "C";
  quantity: number;
  description: string;             // "16A Type C MCB (Power circuits)"
  estimatedCostPerUnit?: number;
  estimatedTotalCost?: number;
}

export interface BOMRCCBItem {
  category: "RCCB";
  pricingCode: PricingCode;
  ratingAmps: number;
  poles: number;
  sensitivityMa: number;
  quantity: number;
  description: string;
  estimatedCostPerUnit?: number;
  estimatedTotalCost?: number;
}

export interface BOMDistributionBoard {
  category: "DB";
  pricingCode: PricingCode;
  ways: number;
  description: string;             // "12-Way SPN Distribution Board"
  quantity: number;
  estimatedCostPerUnit?: number;
  estimatedTotalCost?: number;
}

export interface BOMConduitItem {
  category: "CONDUIT";
  pricingCode: PricingCode;
  sizeMm: string;                  // "20mm", "25mm", "32mm"
  totalMeters: number;
  description: string;
  estimatedCostPerMeter?: number;
  estimatedTotalCost?: number;
}

export interface BOMSwitchgearItem {
  category: "SWITCHGEAR";
  pricingCode: PricingCode;
  itemType: "SWITCH" | "SOCKET_5A" | "SOCKET_15A" | "FAN_REGULATOR" | "BELL_PUSH" | "BLANK_PLATE";
  quantity: number;
  description: string;
  estimatedCostPerUnit?: number;
  estimatedTotalCost?: number;
}

export interface BOMMainSwitch {
  category: "MAIN_SWITCH";
  pricingCode: PricingCode;
  ratingAmps: number;
  poles: number;
  quantity: number;
  description: string;
  estimatedCostPerUnit?: number;
  estimatedTotalCost?: number;
}

// Union type for all BOM items
export type BOMItem =
  | BOMWireItem
  | BOMEarthWireItem
  | BOMMCBItem
  | BOMRCCBItem
  | BOMDistributionBoard
  | BOMConduitItem
  | BOMSwitchgearItem
  | BOMMainSwitch;

// ---------------------------------------------------------------------------
// FINAL BOM RESULT
// ---------------------------------------------------------------------------

export interface BOMResult {
  // Metadata
  generatedAt: string;             // ISO timestamp
  algorithmVersion: string;        // "1.0.0" — track for accuracy improvements
  disclaimer: string;

  // Summary
  totalConnectedLoadKw: number;
  maxDemandKw: number;             // after diversity factors
  recommendedPhase: "SINGLE" | "THREE";
  phaseDecision: {
    engineeringRecommendation: "SINGLE" | "THREE";
    regulatoryRecommendation: "SINGLE" | "THREE";
    finalRecommendation: "SINGLE" | "THREE";
    connectedLoadThresholdKw: number;
    regulatoryPolicyKey: string;
    /** UP's rule is "5 kW or more", Delhi's and Haryana's "above". Absent on BOMs saved before Oct 2026. */
    threePhaseAtThreshold?: boolean;
    /** Whose rule it is, e.g. "Delhi (DERC)". Null for a rule with no known authority. */
    supplyAuthority?: string | null;
    reasons: string[];
  };
  totalCircuits: number;

  // Detailed breakdown
  circuits: CircuitDefinition[];
  loadBreakdown: LoadBreakdown[];

  // BOM line items (grouped by category for display)
  items: BOMItem[];

  // Cost summary
  estimatedTotalCost: number | null; // null if no PriceIndex data available
  costBreakdown: {
    wires: number | null;
    switchgear: number | null;
    conduit: number | null;
    distributionBoard: number | null;
    mcbsAndProtection: number | null;
  };

  // Warnings/notes for the user
  warnings: string[];
}
