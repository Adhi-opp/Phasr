// src/features/calculator/testScenarios.ts
// ============================================================================
// TEST SCENARIOS FOR BOM CALCULATOR VALIDATION
// ============================================================================
// Run with: npx tsx src/features/calculator/testScenarios.ts
// Compare output against real electrician quotes to validate accuracy.
// Target: within ±15% of a real on-site estimate.
// ============================================================================

import { calculateBOM } from "./calculateBOM";
import type { CalculatorInput, RoomSpec } from "./type";

// Helper to create room IDs
let roomCounter = 0;
function makeRoom(partial: Omit<RoomSpec, "id">): RoomSpec {
  return { id: `room-${++roomCounter}`, ...partial };
}

// ============================================================================
// SCENARIO 1: Standard 2BHK Flat (900 sq ft, Ghaziabad)
// Typical middle-class flat: 2 bedrooms, 1 hall, 1 kitchen, 2 bathrooms
// Expected real-world estimate: ~₹45,000-55,000 in materials (2026 pricing)
// ============================================================================

const scenario2BHK: CalculatorInput = {
  projectName: "2BHK Flat - Raj Nagar, Ghaziabad",
  propertyType: "RESIDENTIAL",
  city: "Ghaziabad",
  pincode: "201002",
  totalFloors: 1,
  rooms: [
    makeRoom({
      name: "Master Bedroom",
      type: "BEDROOM_MASTER",
      floor: 0,
      lengthFt: 14,
      widthFt: 12,
      lightPoints: 3,
      fanPoints: 1,
      socket5A: 4,
      socket15A: 1,
      heavyAppliances: 1, // AC
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Bedroom 2",
      type: "BEDROOM",
      floor: 0,
      lengthFt: 12,
      widthFt: 10,
      lightPoints: 2,
      fanPoints: 1,
      socket5A: 3,
      socket15A: 1,
      heavyAppliances: 1, // AC
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Living Room",
      type: "LIVING_ROOM",
      floor: 0,
      lengthFt: 16,
      widthFt: 12,
      lightPoints: 4,
      fanPoints: 2,
      socket5A: 4,
      socket15A: 2, // TV, Set-top
      heavyAppliances: 1, // AC
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Kitchen",
      type: "KITCHEN",
      floor: 0,
      lengthFt: 10,
      widthFt: 8,
      lightPoints: 2,
      fanPoints: 0,
      socket5A: 2,
      socket15A: 3, // Fridge, Microwave, Mixer
      heavyAppliances: 0,
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Bathroom 1 (Attached)",
      type: "BATHROOM",
      floor: 0,
      lengthFt: 7,
      widthFt: 5,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 1, // Geyser
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Bathroom 2 (Common)",
      type: "BATHROOM_COMMON",
      floor: 0,
      lengthFt: 6,
      widthFt: 5,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 0,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Balcony",
      type: "BALCONY",
      floor: 0,
      lengthFt: 10,
      widthFt: 4,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Passage",
      type: "PASSAGE",
      floor: 0,
      lengthFt: 8,
      widthFt: 4,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 0,
    }),
  ],
  supplyPhase: "SINGLE",
  dbLocation: "NEAR_ENTRANCE",
  dbFloor: 0,
};

// ============================================================================
// SCENARIO 2: Standard 3BHK Flat (1200 sq ft, Noida)
// Slightly upscale: 3 bedrooms, living+dining, modular kitchen, 2 bathrooms
// Expected: ~₹60,000-75,000 in materials
// ============================================================================

roomCounter = 0;
const scenario3BHK: CalculatorInput = {
  projectName: "3BHK Flat - Sector 150, Noida",
  propertyType: "RESIDENTIAL",
  city: "Noida",
  pincode: "201310",
  totalFloors: 1,
  rooms: [
    makeRoom({
      name: "Master Bedroom",
      type: "BEDROOM_MASTER",
      floor: 0,
      lengthFt: 16,
      widthFt: 14,
      lightPoints: 3,
      fanPoints: 1,
      socket5A: 5,
      socket15A: 1,
      heavyAppliances: 1,
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Bedroom 2",
      type: "BEDROOM",
      floor: 0,
      lengthFt: 13,
      widthFt: 11,
      lightPoints: 2,
      fanPoints: 1,
      socket5A: 3,
      socket15A: 1,
      heavyAppliances: 1,
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Bedroom 3",
      type: "BEDROOM",
      floor: 0,
      lengthFt: 12,
      widthFt: 10,
      lightPoints: 2,
      fanPoints: 1,
      socket5A: 3,
      socket15A: 1,
      heavyAppliances: 1,
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Living + Dining",
      type: "LIVING_ROOM",
      floor: 0,
      lengthFt: 20,
      widthFt: 14,
      lightPoints: 6,
      fanPoints: 2,
      socket5A: 5,
      socket15A: 2,
      heavyAppliances: 1,
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Modular Kitchen",
      type: "KITCHEN_MODULAR",
      floor: 0,
      lengthFt: 12,
      widthFt: 10,
      lightPoints: 3,
      fanPoints: 0,
      socket5A: 3,
      socket15A: 4,
      heavyAppliances: 1, // Chimney
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Master Bathroom",
      type: "BATHROOM",
      floor: 0,
      lengthFt: 8,
      widthFt: 6,
      lightPoints: 2,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 1,
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Common Bathroom",
      type: "BATHROOM_COMMON",
      floor: 0,
      lengthFt: 6,
      widthFt: 5,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 0,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Balcony 1",
      type: "BALCONY",
      floor: 0,
      lengthFt: 12,
      widthFt: 4,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Balcony 2",
      type: "BALCONY",
      floor: 0,
      lengthFt: 8,
      widthFt: 4,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Passage",
      type: "PASSAGE",
      floor: 0,
      lengthFt: 10,
      widthFt: 4,
      lightPoints: 2,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 0,
    }),
  ],
  supplyPhase: "SINGLE",
  dbLocation: "NEAR_ENTRANCE",
  dbFloor: 0,
};

// ============================================================================
// SCENARIO 3: AC-Heavy 3BHK Duplex (1800 sq ft, Delhi)
// Upper-middle: all rooms with ACs, modular kitchen, 2 floors
// Expected: ~₹90,000-1,20,000+ in materials. Should trigger 3-phase.
// ============================================================================

roomCounter = 0;
const scenario3BHKDuplex: CalculatorInput = {
  projectName: "3BHK Duplex - Greater Kailash, Delhi",
  propertyType: "RESIDENTIAL",
  city: "Delhi",
  pincode: "110048",
  totalFloors: 2,
  rooms: [
    // GROUND FLOOR
    makeRoom({
      name: "Living Room",
      type: "LIVING_ROOM",
      floor: 0,
      lengthFt: 22,
      widthFt: 16,
      lightPoints: 6,
      fanPoints: 2,
      socket5A: 6,
      socket15A: 3,
      heavyAppliances: 2, // 2 ACs (large room)
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Dining Area",
      type: "DINING",
      floor: 0,
      lengthFt: 14,
      widthFt: 12,
      lightPoints: 3,
      fanPoints: 1,
      socket5A: 2,
      socket15A: 1,
      heavyAppliances: 0,
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Modular Kitchen",
      type: "KITCHEN_MODULAR",
      floor: 0,
      lengthFt: 14,
      widthFt: 12,
      lightPoints: 4,
      fanPoints: 0,
      socket5A: 4,
      socket15A: 5, // Fridge, microwave, mixer, dishwasher, RO
      heavyAppliances: 1, // Electric hob
      exhaustFan: 1,
      hasCookingRange: true,
    }),
    makeRoom({
      name: "Guest Bathroom",
      type: "BATHROOM_COMMON",
      floor: 0,
      lengthFt: 6,
      widthFt: 5,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 0,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Staircase",
      type: "STAIRCASE",
      floor: 0,
      lengthFt: 10,
      widthFt: 4,
      lightPoints: 2,
      fanPoints: 0,
      socket5A: 0,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 0,
    }),

    // FIRST FLOOR
    makeRoom({
      name: "Master Bedroom",
      type: "BEDROOM_MASTER",
      floor: 1,
      lengthFt: 18,
      widthFt: 14,
      lightPoints: 4,
      fanPoints: 1,
      socket5A: 5,
      socket15A: 2,
      heavyAppliances: 1, // AC
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Bedroom 2",
      type: "BEDROOM",
      floor: 1,
      lengthFt: 14,
      widthFt: 12,
      lightPoints: 3,
      fanPoints: 1,
      socket5A: 4,
      socket15A: 1,
      heavyAppliances: 1, // AC
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Bedroom 3 (Kids)",
      type: "BEDROOM",
      floor: 1,
      lengthFt: 12,
      widthFt: 10,
      lightPoints: 2,
      fanPoints: 1,
      socket5A: 3,
      socket15A: 1,
      heavyAppliances: 1, // AC
      exhaustFan: 0,
    }),
    makeRoom({
      name: "Master Bathroom",
      type: "BATHROOM",
      floor: 1,
      lengthFt: 10,
      widthFt: 7,
      lightPoints: 2,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 1, // Geyser
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Common Bathroom",
      type: "BATHROOM",
      floor: 1,
      lengthFt: 7,
      widthFt: 5,
      lightPoints: 1,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 1, // Geyser
      exhaustFan: 1,
    }),
    makeRoom({
      name: "Balcony",
      type: "BALCONY",
      floor: 1,
      lengthFt: 14,
      widthFt: 5,
      lightPoints: 2,
      fanPoints: 0,
      socket5A: 1,
      socket15A: 0,
      heavyAppliances: 0,
      exhaustFan: 0,
    }),
  ],
  supplyPhase: "THREE",
  dbLocation: "NEAR_ENTRANCE",
  dbFloor: 0,
};

// ============================================================================
// RUN ALL SCENARIOS
// ============================================================================

function printBOMSummary(name: string, input: CalculatorInput) {
  console.log("\n" + "=".repeat(70));
  console.log(`  ${name}`);
  console.log("=".repeat(70));
  console.log(`  Rooms: ${input.rooms.length} | Floors: ${input.totalFloors} | Phase: ${input.supplyPhase}`);
  console.log("-".repeat(70));

  const result = calculateBOM(input);

  // Load summary
  console.log(`\n  LOAD SUMMARY:`);
  console.log(`    Total Connected Load: ${result.totalConnectedLoadKw} kW`);
  console.log(`    Max Demand (diversified): ${result.maxDemandKw} kW`);
  console.log(`    Recommended Phase: ${result.recommendedPhase}`);
  console.log(`    Total Circuits: ${result.totalCircuits}`);

  // Wire summary
  console.log(`\n  WIRES:`);
  for (const item of result.items) {
    if (item.category === "WIRE") {
      console.log(
        `    ${item.sizeSqMm} sq mm: ${item.totalMeters}m (${item.coilsRequired} coils × ${item.coilLengthMeters}m)`
      );
    }
  }

  // Earth wire
  for (const item of result.items) {
    if (item.category === "EARTH_WIRE") {
      console.log(`    Earth (DB→pit): ${item.totalMeters}m`);
    }
  }

  // MCBs
  console.log(`\n  MCBs:`);
  for (const item of result.items) {
    if (item.category === "MCB") {
      console.log(`    ${item.description}: ${item.quantity} nos`);
    }
  }

  // DB
  for (const item of result.items) {
    if (item.category === "DB") {
      console.log(`\n  DISTRIBUTION BOARD: ${item.description}`);
    }
  }

  // RCCB & Main Switch
  for (const item of result.items) {
    if (item.category === "RCCB") {
      console.log(`  RCCB: ${item.description}`);
    }
    if (item.category === "MAIN_SWITCH") {
      console.log(`  Main Switch: ${item.description}`);
    }
  }

  // Conduit
  console.log(`\n  CONDUIT:`);
  for (const item of result.items) {
    if (item.category === "CONDUIT") {
      console.log(`    ${item.description}: ${item.totalMeters}m`);
    }
  }

  // Switchgear
  console.log(`\n  SWITCHGEAR:`);
  for (const item of result.items) {
    if (item.category === "SWITCHGEAR") {
      console.log(`    ${item.description}: ${item.quantity} nos`);
    }
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log(`\n  ⚠ WARNINGS:`);
    for (const w of result.warnings) {
      console.log(`    - ${w}`);
    }
  }

  // Load breakdown per room
  console.log(`\n  LOAD PER ROOM:`);
  for (const lb of result.loadBreakdown) {
    console.log(
      `    ${lb.roomName}: ${lb.totalConnectedLoadWatts}W connected → ${Math.round(lb.diversifiedDemandWatts)}W demand`
    );
  }

  console.log("\n" + "-".repeat(70));
  console.log(
    `  VALIDATE: Compare wire meters and MCB counts against a real electrician's quote for this scenario.`
  );
  console.log("=".repeat(70));
}

// Run
console.log("\n🔌 Phasr BOM Calculator — Test Scenarios\n");
printBOMSummary("SCENARIO 1: Standard 2BHK (900 sq ft, Ghaziabad)", scenario2BHK);
printBOMSummary("SCENARIO 2: Standard 3BHK (1200 sq ft, Noida)", scenario3BHK);
printBOMSummary("SCENARIO 3: AC-Heavy 3BHK Duplex (1800 sq ft, Delhi)", scenario3BHKDuplex);

console.log("\n✅ Run complete. Compare outputs against real quotes.\n");
