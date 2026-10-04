// src/features/calculator/layoutTestScenarios.ts
// ============================================================================
// LAYOUT BRIDGE VALIDATION — Compare layout-generated BOM vs manual scenarios
// ============================================================================
// Run with: npx tsx src/features/calculator/layoutTestScenarios.ts
//
// This file defines the SAME 3 scenarios from testScenarios.ts, but expressed
// as LayoutInput (homeowner-friendly). It then:
//   1. Runs each LayoutInput through buildCalculatorInput() → calculateBOM()
//   2. Runs the original manual CalculatorInput through calculateBOM()
//   3. Compares key BOM metrics between both paths
//   4. Reports pass/fail for ±10% tolerance on each metric
//
// If all scenarios pass within ±10%, the bridge is validated.
// ============================================================================

import { calculateBOM } from "./calculateBOM";
import { buildCalculatorInput } from "./generateRoomSpecs";
import type { CalculatorInput, RoomSpec, BOMResult } from "./type";
import type { LayoutInput } from "./layoutTypes";

// ============================================================================
// LAYOUT INPUTS — Same 3 scenarios, expressed as homeowner-friendly input
// ============================================================================

const layout2BHK: LayoutInput = {
  propertyType: "FLAT",
  city: "Ghaziabad",
  bedrooms: 2,
  bathrooms: 2,
  balconies: 1,
  modularKitchen: false,
  acInBedrooms: true,
  acInLivingRoom: true,
  geyserInBathrooms: true,
  totalFloors: 1,
  approxSqFt: 900,
};

const layout3BHK: LayoutInput = {
  propertyType: "FLAT",
  city: "Noida",
  bedrooms: 3,
  bathrooms: 2,
  balconies: 2,
  modularKitchen: true,
  acInBedrooms: true,
  acInLivingRoom: true,
  geyserInBathrooms: true,
  totalFloors: 1,
  approxSqFt: 1200,
};

const layout3BHKDuplex: LayoutInput = {
  propertyType: "DUPLEX",
  city: "Delhi",
  bedrooms: 3,
  bathrooms: 3,
  balconies: 1,
  modularKitchen: true,
  acInBedrooms: true,
  acInLivingRoom: true,
  geyserInBathrooms: true,
  totalFloors: 2,
  approxSqFt: 1800,
};

// ============================================================================
// MANUAL SCENARIOS — Copied from testScenarios.ts for comparison baseline
// ============================================================================

let roomCounter = 0;
function makeRoom(partial: Omit<RoomSpec, "id">): RoomSpec {
  return { id: `manual-${++roomCounter}`, ...partial };
}

// --- Scenario 1: 2BHK Flat (identical to testScenarios.ts) ---
const manual2BHK: CalculatorInput = {
  projectName: "2BHK Flat - Raj Nagar, Ghaziabad",
  propertyType: "RESIDENTIAL",
  city: "Ghaziabad",
  pincode: "201002",
  totalFloors: 1,
  rooms: [
    makeRoom({ name: "Master Bedroom", type: "BEDROOM_MASTER", floor: 0, lengthFt: 14, widthFt: 12, lightPoints: 3, fanPoints: 1, socket5A: 4, socket15A: 1, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Bedroom 2", type: "BEDROOM", floor: 0, lengthFt: 12, widthFt: 10, lightPoints: 2, fanPoints: 1, socket5A: 3, socket15A: 1, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Living Room", type: "LIVING_ROOM", floor: 0, lengthFt: 16, widthFt: 12, lightPoints: 4, fanPoints: 2, socket5A: 4, socket15A: 2, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Kitchen", type: "KITCHEN", floor: 0, lengthFt: 10, widthFt: 8, lightPoints: 2, fanPoints: 0, socket5A: 2, socket15A: 3, heavyAppliances: 0, exhaustFan: 1 }),
    makeRoom({ name: "Bathroom 1 (Attached)", type: "BATHROOM", floor: 0, lengthFt: 7, widthFt: 5, lightPoints: 1, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 1, exhaustFan: 1 }),
    makeRoom({ name: "Bathroom 2 (Common)", type: "BATHROOM_COMMON", floor: 0, lengthFt: 6, widthFt: 5, lightPoints: 1, fanPoints: 0, socket5A: 0, socket15A: 0, heavyAppliances: 0, exhaustFan: 1 }),
    makeRoom({ name: "Balcony", type: "BALCONY", floor: 0, lengthFt: 10, widthFt: 4, lightPoints: 1, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 0, exhaustFan: 0 }),
    makeRoom({ name: "Passage", type: "PASSAGE", floor: 0, lengthFt: 8, widthFt: 4, lightPoints: 1, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 0, exhaustFan: 0 }),
  ],
  supplyPhase: "SINGLE",
  dbLocation: "NEAR_ENTRANCE",
  dbFloor: 0,
};

// --- Scenario 2: 3BHK Flat ---
roomCounter = 0;
const manual3BHK: CalculatorInput = {
  projectName: "3BHK Flat - Sector 150, Noida",
  propertyType: "RESIDENTIAL",
  city: "Noida",
  pincode: "201310",
  totalFloors: 1,
  rooms: [
    makeRoom({ name: "Master Bedroom", type: "BEDROOM_MASTER", floor: 0, lengthFt: 16, widthFt: 14, lightPoints: 3, fanPoints: 1, socket5A: 5, socket15A: 1, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Bedroom 2", type: "BEDROOM", floor: 0, lengthFt: 13, widthFt: 11, lightPoints: 2, fanPoints: 1, socket5A: 3, socket15A: 1, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Bedroom 3", type: "BEDROOM", floor: 0, lengthFt: 12, widthFt: 10, lightPoints: 2, fanPoints: 1, socket5A: 3, socket15A: 1, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Living + Dining", type: "LIVING_ROOM", floor: 0, lengthFt: 20, widthFt: 14, lightPoints: 6, fanPoints: 2, socket5A: 5, socket15A: 2, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Modular Kitchen", type: "KITCHEN_MODULAR", floor: 0, lengthFt: 12, widthFt: 10, lightPoints: 3, fanPoints: 0, socket5A: 3, socket15A: 4, heavyAppliances: 1, exhaustFan: 1 }),
    makeRoom({ name: "Master Bathroom", type: "BATHROOM", floor: 0, lengthFt: 8, widthFt: 6, lightPoints: 2, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 1, exhaustFan: 1 }),
    makeRoom({ name: "Common Bathroom", type: "BATHROOM_COMMON", floor: 0, lengthFt: 6, widthFt: 5, lightPoints: 1, fanPoints: 0, socket5A: 0, socket15A: 0, heavyAppliances: 0, exhaustFan: 1 }),
    makeRoom({ name: "Balcony 1", type: "BALCONY", floor: 0, lengthFt: 12, widthFt: 4, lightPoints: 1, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 0, exhaustFan: 0 }),
    makeRoom({ name: "Balcony 2", type: "BALCONY", floor: 0, lengthFt: 8, widthFt: 4, lightPoints: 1, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 0, exhaustFan: 0 }),
    makeRoom({ name: "Passage", type: "PASSAGE", floor: 0, lengthFt: 10, widthFt: 4, lightPoints: 2, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 0, exhaustFan: 0 }),
  ],
  supplyPhase: "SINGLE",
  dbLocation: "NEAR_ENTRANCE",
  dbFloor: 0,
};

// --- Scenario 3: 3BHK Duplex ---
roomCounter = 0;
const manual3BHKDuplex: CalculatorInput = {
  projectName: "3BHK Duplex - Greater Kailash, Delhi",
  propertyType: "RESIDENTIAL",
  city: "Delhi",
  pincode: "110048",
  totalFloors: 2,
  rooms: [
    makeRoom({ name: "Living Room", type: "LIVING_ROOM", floor: 0, lengthFt: 22, widthFt: 16, lightPoints: 6, fanPoints: 2, socket5A: 6, socket15A: 3, heavyAppliances: 2, exhaustFan: 0 }),
    makeRoom({ name: "Dining Area", type: "DINING", floor: 0, lengthFt: 14, widthFt: 12, lightPoints: 3, fanPoints: 1, socket5A: 2, socket15A: 1, heavyAppliances: 0, exhaustFan: 0 }),
    makeRoom({ name: "Modular Kitchen", type: "KITCHEN_MODULAR", floor: 0, lengthFt: 14, widthFt: 12, lightPoints: 4, fanPoints: 0, socket5A: 4, socket15A: 5, heavyAppliances: 1, exhaustFan: 1, hasCookingRange: true }),
    makeRoom({ name: "Guest Bathroom", type: "BATHROOM_COMMON", floor: 0, lengthFt: 6, widthFt: 5, lightPoints: 1, fanPoints: 0, socket5A: 0, socket15A: 0, heavyAppliances: 0, exhaustFan: 1 }),
    makeRoom({ name: "Staircase", type: "STAIRCASE", floor: 0, lengthFt: 10, widthFt: 4, lightPoints: 2, fanPoints: 0, socket5A: 0, socket15A: 0, heavyAppliances: 0, exhaustFan: 0 }),
    makeRoom({ name: "Master Bedroom", type: "BEDROOM_MASTER", floor: 1, lengthFt: 18, widthFt: 14, lightPoints: 4, fanPoints: 1, socket5A: 5, socket15A: 2, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Bedroom 2", type: "BEDROOM", floor: 1, lengthFt: 14, widthFt: 12, lightPoints: 3, fanPoints: 1, socket5A: 4, socket15A: 1, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Bedroom 3 (Kids)", type: "BEDROOM", floor: 1, lengthFt: 12, widthFt: 10, lightPoints: 2, fanPoints: 1, socket5A: 3, socket15A: 1, heavyAppliances: 1, exhaustFan: 0 }),
    makeRoom({ name: "Master Bathroom", type: "BATHROOM", floor: 1, lengthFt: 10, widthFt: 7, lightPoints: 2, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 1, exhaustFan: 1 }),
    makeRoom({ name: "Common Bathroom", type: "BATHROOM", floor: 1, lengthFt: 7, widthFt: 5, lightPoints: 1, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 1, exhaustFan: 1 }),
    makeRoom({ name: "Balcony", type: "BALCONY", floor: 1, lengthFt: 14, widthFt: 5, lightPoints: 2, fanPoints: 0, socket5A: 1, socket15A: 0, heavyAppliances: 0, exhaustFan: 0 }),
  ],
  supplyPhase: "THREE",
  dbLocation: "NEAR_ENTRANCE",
  dbFloor: 0,
};

// ============================================================================
// COMPARISON ENGINE
// ============================================================================

interface BOMMetrics {
  totalConnectedLoadKw: number;
  maxDemandKw: number;
  totalCircuits: number;
  totalWireMeters: Record<string, number>; // by gauge
  totalMCBs: number;
  totalHeavyAppliances: number;
  recommendedPhase: string;
}

function extractMetrics(result: BOMResult): BOMMetrics {
  const totalWireMeters: Record<string, number> = {};
  let totalMCBs = 0;

  for (const item of result.items) {
    if (item.category === "WIRE") {
      totalWireMeters[`${item.sizeSqMm}mm`] = item.totalMeters;
    }
    if (item.category === "MCB") {
      totalMCBs += item.quantity;
    }
  }

  // Count heavy appliance circuits from the circuit list
  const totalHeavyAppliances = result.circuits.filter(
    (c) => c.circuitType === "HEAVY_APPLIANCE" || c.circuitType === "COOKING_RANGE"
  ).length;

  return {
    totalConnectedLoadKw: result.totalConnectedLoadKw,
    maxDemandKw: result.maxDemandKw,
    totalCircuits: result.totalCircuits,
    totalWireMeters,
    totalMCBs,
    totalHeavyAppliances,
    recommendedPhase: result.recommendedPhase,
  };
}

function percentDiff(layout: number, manual: number): number {
  if (manual === 0) return layout === 0 ? 0 : 100;
  return ((layout - manual) / manual) * 100;
}

function compareScenario(
  scenarioName: string,
  layoutInput: LayoutInput,
  manualInput: CalculatorInput,
  tolerancePercent: number = 10
): boolean {
  // Build from layout
  const layoutCalcInput = buildCalculatorInput(layoutInput);
  const layoutResult = calculateBOM(layoutCalcInput);
  const layoutMetrics = extractMetrics(layoutResult);

  // Run manual
  const manualResult = calculateBOM(manualInput);
  const manualMetrics = extractMetrics(manualResult);

  console.log("\n" + "=".repeat(74));
  console.log(`  ${scenarioName}`);
  console.log("=".repeat(74));

  // Show room counts
  console.log(`  Rooms: layout=${layoutCalcInput.rooms.length} | manual=${manualInput.rooms.length}`);
  console.log("-".repeat(74));

  // Show generated rooms
  console.log(`\n  LAYOUT-GENERATED ROOMS:`);
  for (const room of layoutCalcInput.rooms) {
    const pts = room.lightPoints + room.fanPoints + room.exhaustFan + room.socket5A;
    console.log(
      `    F${room.floor} | ${room.name.padEnd(20)} | ${pts} std pts | ` +
      `${room.socket15A}×15A | ${room.heavyAppliances} heavy` +
      `${room.hasCookingRange ? " | COOKING" : ""}`
    );
  }

  // Compare metrics
  let allPassed = true;

  const checks: { label: string; layout: number; manual: number }[] = [
    { label: "Connected Load (kW)", layout: layoutMetrics.totalConnectedLoadKw, manual: manualMetrics.totalConnectedLoadKw },
    { label: "Max Demand (kW)", layout: layoutMetrics.maxDemandKw, manual: manualMetrics.maxDemandKw },
    { label: "Total Circuits", layout: layoutMetrics.totalCircuits, manual: manualMetrics.totalCircuits },
    { label: "Total MCBs", layout: layoutMetrics.totalMCBs, manual: manualMetrics.totalMCBs },
    { label: "Heavy Circuits", layout: layoutMetrics.totalHeavyAppliances, manual: manualMetrics.totalHeavyAppliances },
  ];

  // Add wire gauge comparisons
  const allGauges = new Set([
    ...Object.keys(layoutMetrics.totalWireMeters),
    ...Object.keys(manualMetrics.totalWireMeters),
  ]);
  for (const gauge of [...allGauges].sort()) {
    checks.push({
      label: `Wire ${gauge}`,
      layout: layoutMetrics.totalWireMeters[gauge] || 0,
      manual: manualMetrics.totalWireMeters[gauge] || 0,
    });
  }

  console.log(`\n  METRIC COMPARISON (tolerance: +/-${tolerancePercent}%):`);
  console.log(`  ${"Metric".padEnd(25)} ${"Layout".padStart(10)} ${"Manual".padStart(10)} ${"Diff %".padStart(10)}  Status`);
  console.log("  " + "-".repeat(70));

  for (const check of checks) {
    let passed: boolean;
    let diffStr: string;

    // HARD ASSERTIONS: MCBs, Circuits, and Heavy Circuits must match exactly.
    // These are discrete counts — a missing MCB or circuit is a structural error,
    // not a rounding difference. Zero tolerance.
    if (check.label.includes("MCB") || check.label.includes("Circuit")) {
      passed = check.layout === check.manual;
      diffStr = passed ? "  EXACT" : "MISMATCH";
    }
    // FLEXIBLE ASSERTIONS: Wire meters and load kW get the ±10% tolerance.
    // These are continuous values where small point-count differences cause
    // proportional (but acceptable) wire length drift.
    else {
      const diff = percentDiff(check.layout, check.manual);
      passed = Math.abs(diff) <= tolerancePercent;
      diffStr = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
    }

    if (!passed) allPassed = false;

    const status = passed ? "PASS" : "FAIL";
    console.log(
      `  ${check.label.padEnd(25)} ${String(check.layout).padStart(10)} ${String(check.manual).padStart(10)} ${diffStr.padStart(10)}  ${status}`
    );
  }

  // Phase recommendation — HARD ASSERTION (must match exactly)
  console.log(`\n  Phase: layout=${layoutMetrics.recommendedPhase} | manual=${manualMetrics.recommendedPhase}`);
  if (layoutMetrics.recommendedPhase !== manualMetrics.recommendedPhase) {
    console.log(`  >>> FAIL: Phase mismatch — layout bridge recommends ${layoutMetrics.recommendedPhase}, manual expects ${manualMetrics.recommendedPhase}`);
    allPassed = false;
  }

  // Warnings
  if (layoutResult.warnings.length > 0) {
    console.log(`\n  WARNINGS (layout path):`);
    for (const w of layoutResult.warnings) {
      console.log(`    - ${w}`);
    }
  }

  const verdict = allPassed ? "ALL METRICS WITHIN TOLERANCE" : "SOME METRICS EXCEEDED TOLERANCE";
  console.log(`\n  VERDICT: ${verdict}`);
  console.log("=".repeat(74));

  return allPassed;
}

// ============================================================================
// RUN ALL COMPARISONS
// ============================================================================

console.log("\n  Phasr Layout Bridge Validation");
console.log("  Comparing layout-generated BOM vs manually-defined test scenarios\n");

const results: boolean[] = [];

results.push(compareScenario(
  "SCENARIO 1: 2BHK Flat (900 sqft, Ghaziabad)",
  layout2BHK,
  manual2BHK
));

results.push(compareScenario(
  "SCENARIO 2: 3BHK Flat (1200 sqft, Noida)",
  layout3BHK,
  manual3BHK
));

results.push(compareScenario(
  "SCENARIO 3: 3BHK Duplex (1800 sqft, Delhi)",
  layout3BHKDuplex,
  manual3BHKDuplex
));

// Final summary
console.log("\n" + "=".repeat(74));
console.log("  FINAL SUMMARY");
console.log("=".repeat(74));

const scenarioNames = [
  "2BHK Flat (Ghaziabad)",
  "3BHK Flat (Noida)",
  "3BHK Duplex (Delhi)",
];

for (let i = 0; i < results.length; i++) {
  console.log(`  ${scenarioNames[i]}: ${results[i] ? "PASSED" : "NEEDS REVIEW"}`);
}

const allPassed = results.every(Boolean);
console.log(`\n  Overall: ${allPassed ? "ALL SCENARIOS PASSED" : "SOME SCENARIOS NEED REVIEW"}`);
console.log("=".repeat(74));
console.log();
