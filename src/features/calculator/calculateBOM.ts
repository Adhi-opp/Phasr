// src/features/calculator/calculateBOM.ts
// ============================================================================
// IS 732 COMPLIANT BILL OF MATERIALS CALCULATOR — v1.1
// ============================================================================
// Pure function. No DB. No UI. No side effects.
//
// v1.1 fixes:
//   - Circuit grouping: lighting+5A grouped across rooms per floor (8-10 pts/circuit)
//   - 15A sockets: grouped 2 per circuit (not 1 per room)
//   - Heavy appliances: dedicated 4.0 sq mm circuit each, 12-15m avg run
//   - Wire lengths: 6-8m per standard point, not perimeter-based bloat
//   - Demand: whole-house diversity 0.4 lighting, 0.4 heavy, threshold 7kW
// ============================================================================

import {
  WIRE_GAUGES,
  EARTH_WIRE,
  CIRCUIT_TYPES,
  CONDUIT,
  SAFETY_MARGIN_MULTIPLIER,
  CONDUIT_WASTAGE_MULTIPLIER,
  DB_SIZING,
  RCCB_SPECS,
  MAIN_SWITCH,
  APPLIANCE_LOADS_WATTS,
  ELECTRICAL_CONSTANTS,
  VOLTAGE_DROP,
  BOQ_DISCLAIMER,
  type WireGaugeKey,
} from "./constants";
import {
  resolveRegulatoryPhasePolicy,
  type RegulatoryPolicyResult,
} from "./regulatoryPolicy";

import type {
  CalculatorInput,
  RoomSpec,
  CircuitDefinition,
  LoadBreakdown,
  BOMWireItem,
  BOMEarthWireItem,
  BOMMCBItem,
  BOMRCCBItem,
  BOMDistributionBoard,
  BOMConduitItem,
  BOMSwitchgearItem,
  BOMMainSwitch,
  BOMItem,
  BOMResult,
  PricingCode,
} from "./type";

const ALGORITHM_VERSION = "1.1.0";

// ============================================================================
// REALISTIC WIRE LENGTH CONSTANTS
// Based on actual Indian residential construction practice.
// ============================================================================

/** Average meters of wire per standard point (light/fan/5A socket) from room switchboard */
const METERS_PER_STANDARD_POINT = 7;

/** Average meters for a dedicated heavy appliance run (DB → appliance) */
const METERS_PER_DEDICATED_RUN = 14;

/** Extra meters added for floor-to-floor runs */
const METERS_PER_FLOOR_DIFF = 4;

/** Points grouped per lighting+5A circuit (Indian practice: 8-10) */
const POINTS_PER_LIGHT_CIRCUIT = 8;

/** Max 15A sockets per power circuit */
const SOCKETS_15A_PER_CIRCUIT = 2;

/** Whole-house diversity factors (applied to TOTAL, not per-room) */
const WHOLE_HOUSE_DIVERSITY = {
  lighting: 0.40,       // 40% of all lights/fans on simultaneously
  power15A: 0.50,       // 50% of 15A sockets active at once
  heavyAppliances: 0.40, // 40% of ACs/geysers running simultaneously
  cooking: 0.80,         // 80% — cooking is usually all-on
};

/** Three-phase threshold — standard 2BHK rarely exceeds this */
const ENGINEERING_THREE_PHASE_THRESHOLD_KW = 7;

// ============================================================================
// HELPERS
// ============================================================================

function getDbDistance(room: RoomSpec, dbFloor: number): number {
  if (room.customDbDistanceMeters !== undefined) return room.customDbDistanceMeters;
  const floorDiff = Math.abs(room.floor - dbFloor);
  // Base distance 5m same floor + 4m per additional floor
  return 5 + floorDiff * METERS_PER_FLOOR_DIFF;
}

let _circuitCounter = 0;
function nextCircuitId(prefix: string, floor: number): string {
  _circuitCounter++;
  return `${prefix}-F${floor}-${_circuitCounter}`;
}

// ============================================================================
// CIRCUIT GENERATION — Realistic grouping
// ============================================================================

/**
 * Groups standard points (lights, fans, exhaust, 5A sockets) across all rooms
 * on the same floor into shared 10A MCB circuits (8 points each).
 *
 * Groups 15A sockets across all rooms on the same floor into 16A MCB circuits
 * (2 sockets each).
 *
 * Heavy appliances always get individual dedicated 20A circuits.
 * Cooking range gets a dedicated 32A circuit.
 */
function generateAllCircuits(
  rooms: RoomSpec[],
  dbFloor: number
): CircuitDefinition[] {
  _circuitCounter = 0;
  const circuits: CircuitDefinition[] = [];

  // Group rooms by floor
  const roomsByFloor = new Map<number, RoomSpec[]>();
  for (const room of rooms) {
    const floorRooms = roomsByFloor.get(room.floor) || [];
    floorRooms.push(room);
    roomsByFloor.set(room.floor, floorRooms);
  }

  for (const [floor, floorRooms] of roomsByFloor) {
    // ---------------------------------------------------------------
    // 1. LIGHTING + 5A SOCKETS — grouped across rooms on this floor
    //    Each circuit: 10A MCB, 1.5 sq mm wire, max 8 points
    // ---------------------------------------------------------------
    const standardPoints: { roomId: string; roomName: string; description: string }[] = [];

    for (const room of floorRooms) {
      for (let i = 0; i < room.lightPoints; i++) {
        standardPoints.push({ roomId: room.id, roomName: room.name, description: "light" });
      }
      for (let i = 0; i < room.fanPoints; i++) {
        standardPoints.push({ roomId: room.id, roomName: room.name, description: "fan" });
      }
      for (let i = 0; i < room.exhaustFan; i++) {
        standardPoints.push({ roomId: room.id, roomName: room.name, description: "exhaust" });
      }
      for (let i = 0; i < room.socket5A; i++) {
        standardPoints.push({ roomId: room.id, roomName: room.name, description: "5A socket" });
      }
    }

    const numLightCircuits = Math.ceil(standardPoints.length / POINTS_PER_LIGHT_CIRCUIT);
    for (let i = 0; i < numLightCircuits; i++) {
      const start = i * POINTS_PER_LIGHT_CIRCUIT;
      const batch = standardPoints.slice(start, start + POINTS_PER_LIGHT_CIRCUIT);
      const pointCount = batch.length;

      // Wire: avg meters per point × point count + DB distance
      const avgDbDist = getDbDistance(floorRooms[0], dbFloor); // approximate
      const wireRun = pointCount * METERS_PER_STANDARD_POINT + avgDbDist;

      // Summarize which rooms this circuit covers
      const roomNames = [...new Set(batch.map((p) => p.roomName))];
      const desc = `${pointCount} pts (${roomNames.join(", ")})`;

      circuits.push({
        circuitId: nextCircuitId("LT", floor),
        circuitType: "LIGHTING",
        roomId: batch[0].roomId,
        roomName: roomNames.length === 1 ? roomNames[0] : `Floor ${floor} shared`,
        floor,
        wireGauge: "1.5",
        mcbRatingAmps: 10,
        pointCount,
        pointDescription: desc,
        wireLengthMeters: wireRun,
        conduitLengthMeters: wireRun * 0.85,
      });
    }

    // ---------------------------------------------------------------
    // 2. 15A POWER SOCKETS — grouped 2 per circuit, 16A MCB, 2.5 sq mm
    // ---------------------------------------------------------------
    const power15APoints: { roomId: string; roomName: string }[] = [];
    for (const room of floorRooms) {
      for (let i = 0; i < room.socket15A; i++) {
        power15APoints.push({ roomId: room.id, roomName: room.name });
      }
    }

    const num15ACircuits = Math.ceil(power15APoints.length / SOCKETS_15A_PER_CIRCUIT);
    for (let i = 0; i < num15ACircuits; i++) {
      const start = i * SOCKETS_15A_PER_CIRCUIT;
      const batch = power15APoints.slice(start, start + SOCKETS_15A_PER_CIRCUIT);
      const pointCount = batch.length;

      const avgDbDist = getDbDistance(floorRooms[0], dbFloor);
      // 15A sockets need slightly longer runs (heavier gauge, more careful routing)
      const wireRun = pointCount * (METERS_PER_STANDARD_POINT + 2) + avgDbDist;

      const roomNames = [...new Set(batch.map((p) => p.roomName))];

      circuits.push({
        circuitId: nextCircuitId("PW", floor),
        circuitType: "POWER_15A",
        roomId: batch[0].roomId,
        roomName: roomNames.length === 1 ? roomNames[0] : `Floor ${floor} power`,
        floor,
        wireGauge: "2.5",
        mcbRatingAmps: 16,
        pointCount,
        pointDescription: `${pointCount}× 15A socket (${roomNames.join(", ")})`,
        wireLengthMeters: wireRun,
        conduitLengthMeters: wireRun * 0.85,
      });
    }

    // ---------------------------------------------------------------
    // 3. HEAVY APPLIANCES — each gets a dedicated 20A MCB, 4.0 sq mm
    // ---------------------------------------------------------------
    for (const room of floorRooms) {
      for (let i = 0; i < room.heavyAppliances; i++) {
        const wireRun = METERS_PER_DEDICATED_RUN + Math.abs(floor - dbFloor) * METERS_PER_FLOOR_DIFF;

        circuits.push({
          circuitId: nextCircuitId("HV", floor),
          circuitType: "HEAVY_APPLIANCE",
          roomId: room.id,
          roomName: room.name,
          floor,
          wireGauge: "4.0",
          mcbRatingAmps: 20,
          pointCount: 1,
          pointDescription: `Dedicated AC/Geyser (${room.name})`,
          wireLengthMeters: wireRun,
          conduitLengthMeters: wireRun * 0.85,
        });
      }

      // ---------------------------------------------------------------
      // 4. COOKING RANGE — dedicated 32A MCB, 6.0 sq mm
      // ---------------------------------------------------------------
      if (room.hasCookingRange) {
        const wireRun = METERS_PER_DEDICATED_RUN + Math.abs(floor - dbFloor) * METERS_PER_FLOOR_DIFF;

        circuits.push({
          circuitId: nextCircuitId("CK", floor),
          circuitType: "COOKING_RANGE",
          roomId: room.id,
          roomName: room.name,
          floor,
          wireGauge: "6.0",
          mcbRatingAmps: 32,
          pointCount: 1,
          pointDescription: `Cooking range / induction hob (${room.name})`,
          wireLengthMeters: wireRun,
          conduitLengthMeters: wireRun * 0.85,
        });
      }
    }
  }

  return circuits;
}

// ============================================================================
// LOAD CALCULATION — with whole-house diversity
// ============================================================================

function calculateLoadForRoom(room: RoomSpec): LoadBreakdown {
  // Lighting: LED bulbs + ceiling fans + exhaust
  const lightingLoadWatts =
    room.lightPoints * APPLIANCE_LOADS_WATTS.ledBulb +
    room.fanPoints * APPLIANCE_LOADS_WATTS.ceilingFan +
    room.exhaustFan * APPLIANCE_LOADS_WATTS.exhaustFan;

  // 15A sockets: average ~500W each (fridge, microwave, mixer etc.)
  const powerLoadWatts = room.socket15A * 500;

  // Heavy: average 1500W per appliance (AC/geyser blended average)
  const heavyLoadWatts = room.heavyAppliances * 1500;

  // Cooking
  const cookingLoadWatts = room.hasCookingRange ? APPLIANCE_LOADS_WATTS.cookingRange : 0;

  const totalConnectedLoadWatts =
    lightingLoadWatts + powerLoadWatts + heavyLoadWatts + cookingLoadWatts;

  // Per-room diversity is NOT applied here anymore.
  // Whole-house diversity is applied at the aggregate level in calculateBOM().
  return {
    roomId: room.id,
    roomName: room.name,
    lightingLoadWatts,
    powerLoadWatts: powerLoadWatts + cookingLoadWatts,
    heavyLoadWatts,
    totalConnectedLoadWatts,
    diversifiedDemandWatts: 0, // will be set at whole-house level
  };
}

// ============================================================================
// BOM AGGREGATION
// ============================================================================

function getWirePricingCode(gauge: WireGaugeKey): PricingCode {
  switch (gauge) {
    case "1.5":
      return "WIRE_1_5";
    case "2.5":
      return "WIRE_2_5";
    case "4.0":
      return "WIRE_4_0";
    case "6.0":
      return "WIRE_6_0";
    case "10.0":
      return "WIRE_10_0";
    case "16.0":
      return "WIRE_16_0";
    default:
      throw new Error(`Unsupported wire gauge for pricing: ${gauge}`);
  }
}

function getMcbPricingCode(rating: number, type: "B" | "C"): PricingCode {
  if (rating === 10 && type === "B") return "MCB_10A_B";
  if (rating === 16 && type === "C") return "MCB_16A_C";
  if (rating === 20 && type === "C") return "MCB_20A_C";
  if (rating === 32 && type === "C") return "MCB_32A_C";
  if (rating === 63 && type === "C") return "MCB_63A_C";
  throw new Error(`Unsupported MCB for pricing: ${rating}A Type ${type}`);
}

function getConduitPricingCode(size: string): PricingCode {
  if (size === "20mm") return "CONDUIT_20";
  if (size === "25mm") return "CONDUIT_25";
  if (size === "32mm") return "CONDUIT_32";
  throw new Error(`Unsupported conduit size for pricing: ${size}`);
}

function aggregateWires(circuits: CircuitDefinition[]): BOMWireItem[] {
  const wireMap = new Map<WireGaugeKey, number>();

  for (const circuit of circuits) {
    const existing = wireMap.get(circuit.wireGauge) || 0;
    // 3 conductors per circuit: Phase + Neutral + Earth
    const totalWire = circuit.wireLengthMeters * 3;
    wireMap.set(circuit.wireGauge, existing + totalWire);
  }

  const items: BOMWireItem[] = [];

  for (const [gauge, rawMeters] of wireMap) {
    const spec = WIRE_GAUGES[gauge];
    const metersWithSafety = rawMeters * SAFETY_MARGIN_MULTIPLIER;
    const coils = Math.ceil(metersWithSafety / spec.coilLengthMeters);
    const totalMeters = Math.ceil(metersWithSafety);
    const purchasableMeters = coils * spec.coilLengthMeters;
    const surplusMeters = Math.max(0, purchasableMeters - totalMeters);

    items.push({
      category: "WIRE",
      pricingCode: getWirePricingCode(gauge),
      wireGauge: gauge,
      sizeSqMm: spec.sizeSqMm,
      description: `${spec.sizeSqMm} sq mm FR PVC Copper Wire`,
      totalMeters,
      purchasableMeters,
      surplusMeters,
      coilsRequired: coils,
      coilLengthMeters: spec.coilLengthMeters,
    });
  }

  return items.sort((a, b) => a.sizeSqMm - b.sizeSqMm);
}

function aggregateEarthWire(): BOMEarthWireItem {
  // Main earth bus: DB to earth pit. Typically 10-15m for residential.
  const mainEarthRunMeters = 12;
  const mainEarthSize = EARTH_WIRE.minSizeSqMm;
  const coilLength = WIRE_GAUGES["2.5"].coilLengthMeters;
  const total = Math.ceil(mainEarthRunMeters * SAFETY_MARGIN_MULTIPLIER);
  const coilsRequired = Math.ceil(total / coilLength);
  const purchasableMeters = coilsRequired * coilLength;
  const surplusMeters = Math.max(0, purchasableMeters - total);

  return {
    category: "EARTH_WIRE",
    pricingCode: "EARTH_WIRE_2_5",
    sizeSqMm: mainEarthSize,
    description: `${mainEarthSize} sq mm Green/Yellow Earth Wire (DB to Earth Pit)`,
    totalMeters: total,
    purchasableMeters,
    surplusMeters,
    coilsRequired,
    coilLengthMeters: coilLength,
  };
}

function aggregateMCBs(circuits: CircuitDefinition[]): BOMMCBItem[] {
  const mcbMap = new Map<string, { rating: number; type: "B" | "C"; count: number }>();

  for (const circuit of circuits) {
    const spec = CIRCUIT_TYPES[circuit.circuitType];
    const key = `${circuit.mcbRatingAmps}A-${spec.mcbType}`;
    const existing = mcbMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      mcbMap.set(key, {
        rating: circuit.mcbRatingAmps,
        type: spec.mcbType,
        count: 1,
      });
    }
  }

  return Array.from(mcbMap.values()).map((mcb) => ({
    category: "MCB" as const,
    pricingCode: getMcbPricingCode(mcb.rating, mcb.type),
    ratingAmps: mcb.rating,
    type: mcb.type,
    quantity: mcb.count,
    description: `${mcb.rating}A Type ${mcb.type} MCB`,
  }));
}

function aggregateConduit(circuits: CircuitDefinition[]): BOMConduitItem[] {
  const conduitMap = new Map<string, number>();

  for (const circuit of circuits) {
    const conduitSize = CONDUIT.forCircuit[circuit.circuitType];
    const existing = conduitMap.get(conduitSize) || 0;
    conduitMap.set(conduitSize, existing + circuit.conduitLengthMeters);
  }

  return Array.from(conduitMap.entries()).map(([size, meters]) => {
    const totalMeters = Math.ceil(meters * CONDUIT_WASTAGE_MULTIPLIER);
    return {
      category: "CONDUIT" as const,
      pricingCode: getConduitPricingCode(size),
      sizeMm: size,
      totalMeters,
      description: `${size} PVC Conduit Pipe`,
    };
  });
}

function aggregateSwitchgear(rooms: RoomSpec[]): BOMSwitchgearItem[] {
  let totalSwitches = 0;
  let totalSocket5A = 0;
  let totalSocket15A = 0;
  let totalFanRegulators = 0;

  for (const room of rooms) {
    totalSwitches += room.lightPoints + room.exhaustFan;
    totalSocket5A += room.socket5A;
    totalSocket15A += room.socket15A + room.heavyAppliances;
    totalFanRegulators += room.fanPoints;
  }

  const items: BOMSwitchgearItem[] = [];
  if (totalSwitches > 0) {
    items.push({
      category: "SWITCHGEAR",
      pricingCode: "SWITCH_MODULAR_6A_10A",
      itemType: "SWITCH",
      quantity: totalSwitches,
      description: "Modular switch (6A/10A)",
    });
  }
  if (totalSocket5A > 0) {
    items.push({
      category: "SWITCHGEAR",
      pricingCode: "SOCKET_5A_2M",
      itemType: "SOCKET_5A",
      quantity: totalSocket5A,
      description: "5A socket with switch (2-module)",
    });
  }
  if (totalSocket15A > 0) {
    items.push({
      category: "SWITCHGEAR",
      pricingCode: "SOCKET_15A_16A_3M",
      itemType: "SOCKET_15A",
      quantity: totalSocket15A,
      description: "15A/16A socket with switch (3-module)",
    });
  }
  if (totalFanRegulators > 0) {
    items.push({
      category: "SWITCHGEAR",
      pricingCode: "FAN_REGULATOR_2M",
      itemType: "FAN_REGULATOR",
      quantity: totalFanRegulators,
      description: "Electronic fan regulator (2-module)",
    });
  }

  return items;
}

// ============================================================================
// VOLTAGE DROP CHECK
// ============================================================================

function checkVoltageDropOk(
  wireGauge: WireGaugeKey,
  currentAmps: number,
  lengthMeters: number,
  isLighting: boolean
): boolean {
  const gauge = WIRE_GAUGES[wireGauge];
  const maxDropPercent = isLighting
    ? VOLTAGE_DROP.maxDropLightingPercent
    : VOLTAGE_DROP.maxDropPowerPercent;
  const maxDropVolts = (maxDropPercent / 100) * VOLTAGE_DROP.nominalVoltage;
  const vDrop = (2 * currentAmps * gauge.resistanceOhmPerKm * lengthMeters) / 1000;
  return vDrop <= maxDropVolts;
}

// ============================================================================
// MAIN CALCULATION FUNCTION
// ============================================================================

export function calculateBOM(
  input: CalculatorInput,
  regulatoryOverride?: RegulatoryPolicyResult
): BOMResult {
  const warnings: string[] = [];

  // --- Step 1: Generate circuits (grouped per floor) ---
  const allCircuits = generateAllCircuits(input.rooms, input.dbFloor);

  // --- Step 2: Calculate load per room ---
  const loadBreakdowns: LoadBreakdown[] = input.rooms.map(calculateLoadForRoom);

  // --- Step 3: Whole-house load aggregation + diversity ---
  let totalLightingWatts = 0;
  let totalPowerWatts = 0;
  let totalHeavyWatts = 0;

  for (const lb of loadBreakdowns) {
    totalLightingWatts += lb.lightingLoadWatts;
    totalPowerWatts += lb.powerLoadWatts;
    totalHeavyWatts += lb.heavyLoadWatts;
  }

  const totalConnectedLoadWatts = totalLightingWatts + totalPowerWatts + totalHeavyWatts;

  // Apply WHOLE-HOUSE diversity (not per-room)
  const diversifiedDemandWatts =
    totalLightingWatts * WHOLE_HOUSE_DIVERSITY.lighting +
    totalPowerWatts * WHOLE_HOUSE_DIVERSITY.power15A +
    totalHeavyWatts * WHOLE_HOUSE_DIVERSITY.heavyAppliances;

  // Back-fill per-room diversified demand proportionally
  for (const lb of loadBreakdowns) {
    const roomFraction = totalConnectedLoadWatts > 0
      ? lb.totalConnectedLoadWatts / totalConnectedLoadWatts
      : 0;
    lb.diversifiedDemandWatts = Math.round(diversifiedDemandWatts * roomFraction);
  }

  const totalConnectedLoadKw = totalConnectedLoadWatts / ELECTRICAL_CONSTANTS.WATTS_PER_KW;
  const maxDemandKw = diversifiedDemandWatts / ELECTRICAL_CONSTANTS.WATTS_PER_KW;


  // --- Step 4: Recommend phase (engineering + regulatory) ---
  const engineeringRecommendation: "SINGLE" | "THREE" =
    maxDemandKw > ENGINEERING_THREE_PHASE_THRESHOLD_KW ? "THREE" : "SINGLE";
  const regulatoryPolicy = regulatoryOverride ?? resolveRegulatoryPhasePolicy(input);
  const regulatoryRecommendation: "SINGLE" | "THREE" =
    totalConnectedLoadKw > regulatoryPolicy.connectedLoadThresholdKw ? "THREE" : "SINGLE";
  const recommendedPhase: "SINGLE" | "THREE" =
    engineeringRecommendation === "THREE" || regulatoryRecommendation === "THREE"
      ? "THREE"
      : "SINGLE";

  const phaseReasons: string[] = [];
  if (engineeringRecommendation === "THREE") {
    phaseReasons.push(
      `Engineering demand ${maxDemandKw.toFixed(2)} kW exceeds ${ENGINEERING_THREE_PHASE_THRESHOLD_KW.toFixed(1)} kW threshold.`
    );
  }
  if (regulatoryRecommendation === "THREE") {
    phaseReasons.push(
      `Regulatory connected load ${totalConnectedLoadKw.toFixed(2)} kW exceeds ${regulatoryPolicy.connectedLoadThresholdKw.toFixed(1)} kW threshold (${regulatoryPolicy.cityKey}).`
    );
  }
  if (regulatoryRecommendation === "THREE" && engineeringRecommendation === "SINGLE") {
    warnings.push(
      `3-Phase recommended: engineering demand is safe at ${maxDemandKw.toFixed(2)} kW, but local DISCOM threshold is ${regulatoryPolicy.connectedLoadThresholdKw.toFixed(1)} kW for connected load; your connected load is ${totalConnectedLoadKw.toFixed(2)} kW.`
    );
  }

  // --- Calculate feeder current based on diversified demand ---
let feederCurrentAmps: number;

if (recommendedPhase === "THREE") {
  feederCurrentAmps =
    diversifiedDemandWatts /
    (ELECTRICAL_CONSTANTS.SQRT_3 *
      VOLTAGE_DROP.nominalVoltage *
      ELECTRICAL_CONSTANTS.POWER_FACTOR);
} else {
  feederCurrentAmps =
    diversifiedDemandWatts /
    (VOLTAGE_DROP.nominalVoltage *
      ELECTRICAL_CONSTANTS.POWER_FACTOR);
}

// Add 25% safety margin
feederCurrentAmps *= 1.25;

  if (recommendedPhase !== input.supplyPhase) {
    if (recommendedPhase === "THREE" && engineeringRecommendation === "THREE") {
      warnings.push(
        `Maximum demand is ${maxDemandKw.toFixed(1)} kW (exceeds ${ENGINEERING_THREE_PHASE_THRESHOLD_KW} kW). Three-phase supply recommended.`
      );
    } else if (recommendedPhase === "THREE") {
      warnings.push(
        `Three-phase supply recommended based on connected load compliance policy (${regulatoryPolicy.cityKey} threshold: ${regulatoryPolicy.connectedLoadThresholdKw.toFixed(1)} kW).`
      );
    } else {
      warnings.push(
        `Maximum demand is only ${maxDemandKw.toFixed(1)} kW. Single-phase supply is sufficient.`
      );
    }
  }

  // --- Step 5: Add main feeder circuit (meter → DB) ---
  const minimumFeederGauge: WireGaugeKey = recommendedPhase === "THREE" ? "10.0" : "6.0";
  const minimumFeederSize = WIRE_GAUGES[minimumFeederGauge].sizeSqMm;
  const feederGauge: WireGaugeKey =
    (Object.entries(WIRE_GAUGES) as [WireGaugeKey, (typeof WIRE_GAUGES)[WireGaugeKey]][])
      .sort((a, b) => a[1].sizeSqMm - b[1].sizeSqMm)
      .find(
        ([, spec]) =>
          spec.maxCurrentAmps >= feederCurrentAmps && spec.sizeSqMm >= minimumFeederSize
      )?.[0] ?? minimumFeederGauge;
  const feederLength = 8;

  allCircuits.push({
    circuitId: "MAIN-FEEDER",
    circuitType: "COOKING_RANGE", // placeholder to use thick gauge
    roomId: "MAIN",
    roomName: "Main Feeder (Meter → DB)",
    floor: input.dbFloor,
    wireGauge: feederGauge,
    mcbRatingAmps: recommendedPhase === "THREE"
      ? MAIN_SWITCH.THREE_PHASE.ratingAmps
      : MAIN_SWITCH.SINGLE_PHASE.ratingAmps,
    pointCount: 1,
    pointDescription: "Main feeder from energy meter to distribution board",
    wireLengthMeters: feederLength,
    conduitLengthMeters: feederLength,
  });

  // --- Step 6: Voltage drop checks --- //10:43 am edited
  for (const circuit of allCircuits) {
  if (circuit.circuitId === "MAIN-FEEDER") continue;

  const isLighting = circuit.circuitType === "LIGHTING";

  // Estimate actual current instead of using MCB rating
  let estimatedWatts = 0;

  if (circuit.circuitType === "LIGHTING") {
    estimatedWatts = circuit.pointCount * 120; 
    // ~LED + fan blended
  } else if (circuit.circuitType === "POWER_15A") {
    estimatedWatts = circuit.pointCount * 500;
  } else if (circuit.circuitType === "HEAVY_APPLIANCE") {
    estimatedWatts = 2000;
  } else if (circuit.circuitType === "COOKING_RANGE") {
    estimatedWatts = APPLIANCE_LOADS_WATTS.cookingRange;
  }

  const currentAmps =
    estimatedWatts /
    (VOLTAGE_DROP.nominalVoltage * ELECTRICAL_CONSTANTS.POWER_FACTOR);

  const ok = checkVoltageDropOk(
    circuit.wireGauge,
    currentAmps,
    circuit.wireLengthMeters,
    isLighting
  );//GPT code edited at 10:43 am  the above code block uses real current circuit
    if (!ok) {
      warnings.push(
        `Circuit ${circuit.circuitId} (${circuit.roomName}) may exceed voltage drop limits. Consider upgrading wire gauge or relocating DB closer.`
      );
    }
  }

  // --- Step 7: Aggregate BOM items ---
  const wireItems = aggregateWires(allCircuits);
  const earthItem = aggregateEarthWire();
  const mcbItems = aggregateMCBs(allCircuits);
  const conduitItems = aggregateConduit(allCircuits);
  const switchgearItems = aggregateSwitchgear(input.rooms);

  // RCCB
  const rccbSpec =
    recommendedPhase === "THREE" ? RCCB_SPECS.THREE_PHASE : RCCB_SPECS.SINGLE_PHASE;
  const rccbItem: BOMRCCBItem = {
    category: "RCCB",
    pricingCode:
      rccbSpec.ratingAmps === 40 && rccbSpec.poles === 2
        ? "RCCB_40A_2P_30MA"
        : "RCCB_63A_4P_30MA",
    ratingAmps: rccbSpec.ratingAmps,
    poles: rccbSpec.poles,
    sensitivityMa: rccbSpec.sensitivityMa,
    quantity: 1,
    description: `${rccbSpec.ratingAmps}A ${rccbSpec.poles}-Pole RCCB (${rccbSpec.sensitivityMa}mA)`,
  };

  // Main switch
  const mainSwitchSpec =
    recommendedPhase === "THREE" ? MAIN_SWITCH.THREE_PHASE : MAIN_SWITCH.SINGLE_PHASE;
  const mainSwitchItem: BOMMainSwitch = {
    category: "MAIN_SWITCH",
    pricingCode:
      mainSwitchSpec.ratingAmps === 32 && mainSwitchSpec.poles === 2
        ? "MAIN_SWITCH_32A_DP"
        : "MAIN_SWITCH_63A_FP",
    ratingAmps: mainSwitchSpec.ratingAmps,
    poles: mainSwitchSpec.poles,
    quantity: 1,
    description: `${mainSwitchSpec.ratingAmps}A ${mainSwitchSpec.poles === 2 ? "DP" : "FP"} Main Switch/Isolator`,
  };

  // Distribution board
  const totalMCBs = mcbItems.reduce((sum, m) => sum + m.quantity, 0);
  const dbWays = DB_SIZING.getRequiredWays(totalMCBs);
  const dbItem: BOMDistributionBoard = {
    category: "DB",
    pricingCode: "DB_GENERIC",
    ways: dbWays,
    description: `${dbWays}-Way ${recommendedPhase === "THREE" ? "TPN" : "SPN"} Distribution Board`,
    quantity: 1,
  };

  // --- Step 8: Combine all BOM items ---
  const allItems: BOMItem[] = [
    ...wireItems,
    earthItem,
    ...mcbItems,
    rccbItem,
    mainSwitchItem,
    dbItem,
    ...conduitItems,
    ...switchgearItems,
  ];

  // Display circuits (exclude the feeder)
  const displayCircuits = allCircuits.filter((c) => c.circuitId !== "MAIN-FEEDER");

  return {
    generatedAt: new Date().toISOString(),
    algorithmVersion: ALGORITHM_VERSION,
    disclaimer: BOQ_DISCLAIMER,

    totalConnectedLoadKw: Math.round(totalConnectedLoadKw * 100) / 100,
    maxDemandKw: Math.round(maxDemandKw * 100) / 100,
    recommendedPhase,
    phaseDecision: {
      engineeringRecommendation,
      regulatoryRecommendation,
      finalRecommendation: recommendedPhase,
      connectedLoadThresholdKw: regulatoryPolicy.connectedLoadThresholdKw,
      regulatoryPolicyKey: regulatoryPolicy.cityKey,
      reasons: phaseReasons,
    },
    totalCircuits: displayCircuits.length,

    circuits: displayCircuits,
    loadBreakdown: loadBreakdowns,
    items: allItems,

    estimatedTotalCost: null,
    costBreakdown: {
      wires: null,
      switchgear: null,
      conduit: null,
      distributionBoard: null,
      mcbsAndProtection: null,
    },

    warnings,
  };
}
