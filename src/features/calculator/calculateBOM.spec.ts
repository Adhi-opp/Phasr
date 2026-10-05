import assert from "node:assert/strict";
import { buildDistributionSchedule, MAX_BREAKER_FOR_GAUGE } from "./boardEngine";
import { calculateBOM } from "./calculateBOM";
import { CIRCUIT_TYPES } from "./constants";
import type { CalculatorInput, RoomSpec } from "./type";

function makeRoom(partial: Omit<RoomSpec, "id">, id = "room-1"): RoomSpec {
  return { id, ...partial };
}

function makeInput(city: string, rooms: RoomSpec[]): CalculatorInput {
  return {
    projectName: "spec",
    propertyType: "RESIDENTIAL",
    city,
    pincode: "201301",
    totalFloors: 1,
    rooms,
    supplyPhase: "SINGLE",
    dbLocation: "NEAR_ENTRANCE",
    dbFloor: 0,
  };
}

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

run("NCR regulatory override promotes final phase to THREE when engineering is SINGLE", () => {
  const input = makeInput("Delhi", [
    makeRoom({
      name: "Living Room",
      type: "LIVING_ROOM",
      floor: 0,
      lengthFt: 16,
      widthFt: 12,
      lightPoints: 0,
      fanPoints: 0,
      socket5A: 0,
      socket15A: 0,
      heavyAppliances: 8, // connected 12.0 kW, diversified 4.8 kW
      exhaustFan: 0,
    }),
  ]);

  const result = calculateBOM(input);
  assert.equal(result.phaseDecision.engineeringRecommendation, "SINGLE");
  assert.equal(result.phaseDecision.regulatoryRecommendation, "THREE");
  assert.equal(result.phaseDecision.finalRecommendation, "THREE");
  assert.equal(result.recommendedPhase, result.phaseDecision.finalRecommendation);
  assert.equal(result.phaseDecision.connectedLoadThresholdKw, 10);
  assert.ok(result.warnings.some((warning) => warning.includes("3-Phase recommended: engineering demand is safe")));
});

run("Both channels below threshold keep final recommendation SINGLE", () => {
  const input = makeInput("Jaipur", [
    makeRoom(
      {
        name: "Bedroom",
        type: "BEDROOM",
        floor: 0,
        lengthFt: 12,
        widthFt: 10,
        lightPoints: 2,
        fanPoints: 1,
        socket5A: 2,
        socket15A: 1,
        heavyAppliances: 0,
        exhaustFan: 0,
      },
      "room-2"
    ),
  ]);

  const result = calculateBOM(input);
  assert.equal(result.phaseDecision.connectedLoadThresholdKw, 7);
  assert.equal(result.phaseDecision.engineeringRecommendation, "SINGLE");
  assert.equal(result.phaseDecision.regulatoryRecommendation, "SINGLE");
  assert.equal(result.phaseDecision.finalRecommendation, "SINGLE");
});

run("Wire and earth procurement metadata remains consistent", () => {
  const input = makeInput("Delhi", [
    makeRoom(
      {
        name: "Kitchen",
        type: "KITCHEN_MODULAR",
        floor: 0,
        lengthFt: 12,
        widthFt: 10,
        lightPoints: 3,
        fanPoints: 0,
        socket5A: 3,
        socket15A: 4,
        heavyAppliances: 1,
        exhaustFan: 1,
        hasCookingRange: true,
      },
      "room-3"
    ),
  ]);

  const result = calculateBOM(input);
  const wireAndEarthItems = result.items.filter(
    (item) => item.category === "WIRE" || item.category === "EARTH_WIRE"
  );

  assert.ok(wireAndEarthItems.length > 0);
  for (const item of wireAndEarthItems) {
    assert.ok(item.purchasableMeters >= item.totalMeters);
    assert.equal(item.surplusMeters, item.purchasableMeters - item.totalMeters);
  }
});

// ============================================================================
// ADDITIONAL EDGE CASE SCENARIOS
// ============================================================================

run("1BHK minimal — single bedroom, 1 bath, no AC/geyser stays single phase", () => {
  const input = makeInput("Jaipur", [
    makeRoom(
      {
        name: "Bedroom",
        type: "BEDROOM",
        floor: 0,
        lengthFt: 12,
        widthFt: 10,
        lightPoints: 2,
        fanPoints: 1,
        socket5A: 2,
        socket15A: 1,
        heavyAppliances: 0,
        exhaustFan: 0,
      },
      "1bhk-bed"
    ),
    makeRoom(
      {
        name: "Bathroom",
        type: "BATHROOM",
        floor: 0,
        lengthFt: 6,
        widthFt: 5,
        lightPoints: 1,
        fanPoints: 0,
        socket5A: 0,
        socket15A: 0,
        heavyAppliances: 0,
        exhaustFan: 1,
      },
      "1bhk-bath"
    ),
  ]);

  const result = calculateBOM(input);
  assert.equal(result.recommendedPhase, "SINGLE");
  assert.ok(result.totalConnectedLoadKw < 3, "1BHK without AC/geyser should be well under 3kW");
  assert.ok(result.totalCircuits > 0, "Should generate at least 1 circuit");
  assert.ok(result.items.length > 0, "Should generate BOM items");
});

run("5BHK maximal — all toggles on pushes to three-phase", () => {
  const rooms: RoomSpec[] = [];
  for (let i = 1; i <= 5; i++) {
    rooms.push(
      makeRoom(
        {
          name: `Bedroom ${i}`,
          type: i === 1 ? "BEDROOM_MASTER" : "BEDROOM",
          floor: 0,
          lengthFt: 14,
          widthFt: 12,
          lightPoints: 3,
          fanPoints: 1,
          socket5A: 4,
          socket15A: 2,
          heavyAppliances: 2, // AC + geyser each
          exhaustFan: 0,
        },
        `5bhk-bed-${i}`
      )
    );
  }
  rooms.push(
    makeRoom(
      {
        name: "Kitchen",
        type: "KITCHEN_MODULAR",
        floor: 0,
        lengthFt: 14,
        widthFt: 12,
        lightPoints: 4,
        fanPoints: 0,
        socket5A: 3,
        socket15A: 5,
        heavyAppliances: 1,
        exhaustFan: 1,
        hasCookingRange: true,
      },
      "5bhk-kitchen"
    )
  );

  const input = makeInput("NCR", rooms);
  const result = calculateBOM(input);

  // 5 bedrooms × 2 heavy + 1 kitchen heavy + cooking = lots of load
  assert.ok(result.totalConnectedLoadKw > 10, "5BHK fully loaded should exceed 10kW");
  assert.equal(result.recommendedPhase, "THREE");
  // Should have cooking circuit
  const cookingCircuits = result.circuits.filter((c) => c.circuitType === "COOKING_RANGE");
  assert.equal(cookingCircuits.length, 1, "Should have exactly 1 cooking circuit");
});

run("Duplex multi-floor — circuits exist on both floors", () => {
  const input: CalculatorInput = {
    projectName: "duplex-test",
    propertyType: "RESIDENTIAL",
    city: "Delhi",
    pincode: "110001",
    totalFloors: 2,
    rooms: [
      makeRoom(
        {
          name: "Living Room",
          type: "LIVING_ROOM",
          floor: 0,
          lengthFt: 18,
          widthFt: 14,
          lightPoints: 4,
          fanPoints: 2,
          socket5A: 4,
          socket15A: 2,
          heavyAppliances: 1,
          exhaustFan: 0,
        },
        "duplex-living"
      ),
      makeRoom(
        {
          name: "Master Bedroom",
          type: "BEDROOM_MASTER",
          floor: 1,
          lengthFt: 16,
          widthFt: 12,
          lightPoints: 3,
          fanPoints: 1,
          socket5A: 4,
          socket15A: 1,
          heavyAppliances: 1,
          exhaustFan: 0,
        },
        "duplex-master"
      ),
    ],
    supplyPhase: "SINGLE",
    dbLocation: "NEAR_ENTRANCE",
    dbFloor: 0,
  };

  const result = calculateBOM(input);
  const floor0Circuits = result.circuits.filter((c) => c.floor === 0);
  const floor1Circuits = result.circuits.filter((c) => c.floor === 1);
  assert.ok(floor0Circuits.length > 0, "Should have circuits on floor 0");
  assert.ok(floor1Circuits.length > 0, "Should have circuits on floor 1");
});

run("Phase boundary — just below 7kW stays single, just above goes three", () => {
  // 4 heavy appliances × 1500W = 6kW connected, well under engineering threshold
  const inputBelow = makeInput("Jaipur", [
    makeRoom(
      {
        name: "Room",
        type: "LIVING_ROOM",
        floor: 0,
        lengthFt: 20,
        widthFt: 15,
        lightPoints: 4,
        fanPoints: 2,
        socket5A: 4,
        socket15A: 2,
        heavyAppliances: 4,
        exhaustFan: 0,
      },
      "boundary-below"
    ),
  ]);

  const resultBelow = calculateBOM(inputBelow);
  // diversified demand = 4 × 1500 × 0.4 + lighting + power ≈ ~3.5kW — under 7kW threshold
  assert.equal(resultBelow.phaseDecision.engineeringRecommendation, "SINGLE");

  // 14 heavy appliances × 1500W = 21kW connected, diversified 8.4kW > 7kW
  const inputAbove = makeInput("Jaipur", [
    makeRoom(
      {
        name: "Room",
        type: "LIVING_ROOM",
        floor: 0,
        lengthFt: 20,
        widthFt: 15,
        lightPoints: 4,
        fanPoints: 2,
        socket5A: 4,
        socket15A: 2,
        heavyAppliances: 14,
        exhaustFan: 0,
      },
      "boundary-above"
    ),
  ]);

  const resultAbove = calculateBOM(inputAbove);
  assert.equal(resultAbove.phaseDecision.engineeringRecommendation, "THREE");
});

run("Regulatory override accepts pre-loaded DB policy", () => {
  const input = makeInput("Mumbai", [
    makeRoom(
      {
        name: "Room",
        type: "LIVING_ROOM",
        floor: 0,
        lengthFt: 16,
        widthFt: 12,
        lightPoints: 2,
        fanPoints: 1,
        socket5A: 2,
        socket15A: 1,
        heavyAppliances: 6, // 9kW connected
        exhaustFan: 0,
      },
      "override-room"
    ),
  ]);

  // Without override: Mumbai → DEFAULT (7kW threshold), connected 9kW → THREE regulatory
  const resultDefault = calculateBOM(input);
  assert.equal(resultDefault.phaseDecision.regulatoryRecommendation, "THREE");
  assert.equal(resultDefault.phaseDecision.connectedLoadThresholdKw, 7);

  // With override: pretend Mumbai has 15kW threshold → stays SINGLE regulatory
  const resultOverride = calculateBOM(input, {
    cityKey: "MUMBAI",
    connectedLoadThresholdKw: 15,
  });
  assert.equal(resultOverride.phaseDecision.regulatoryRecommendation, "SINGLE");
  assert.equal(resultOverride.phaseDecision.connectedLoadThresholdKw, 15);
});

run("Circuit IDs are deterministic across multiple calls", () => {
  const input = makeInput("Delhi", [
    makeRoom(
      {
        name: "Bedroom",
        type: "BEDROOM",
        floor: 0,
        lengthFt: 12,
        widthFt: 10,
        lightPoints: 3,
        fanPoints: 1,
        socket5A: 2,
        socket15A: 1,
        heavyAppliances: 1,
        exhaustFan: 0,
      },
      "determinism-room"
    ),
  ]);

  const result1 = calculateBOM(input);
  const result2 = calculateBOM(input);

  const ids1 = result1.circuits.map((c) => c.circuitId);
  const ids2 = result2.circuits.map((c) => c.circuitId);
  assert.deepEqual(ids1, ids2, "Circuit IDs should be identical across calls");
});

// ---------------------------------------------------------------------------
// State three-phase rules (regulatoryPolicy.ts)
// ---------------------------------------------------------------------------

/** Only dedicated circuits, so connected load is exactly heavy × 1.5 kW + sockets × 0.5 kW. */
function loadOnly(heavyAppliances: number, socket15A = 0): RoomSpec[] {
  return [
    makeRoom(
      {
        name: "Load",
        type: "LIVING_ROOM",
        floor: 0,
        lengthFt: 16,
        widthFt: 12,
        lightPoints: 0,
        fanPoints: 0,
        socket5A: 0,
        socket15A,
        heavyAppliances,
        exhaustFan: 0,
      },
      "load-room"
    ),
  ];
}

run("A 6 kW house is single phase in Delhi but three phase in Gurugram and Noida", () => {
  const delhi = calculateBOM(makeInput("Delhi", loadOnly(4)));
  const gurugram = calculateBOM(makeInput("Gurugram", loadOnly(4)));
  const noida = calculateBOM(makeInput("Noida", loadOnly(4)));

  assert.equal(delhi.totalConnectedLoadKw, 6);
  assert.equal(delhi.phaseDecision.engineeringRecommendation, "SINGLE");
  assert.equal(delhi.phaseDecision.regulatoryRecommendation, "SINGLE");
  assert.equal(delhi.phaseDecision.supplyAuthority, "Delhi (DERC)");

  assert.equal(gurugram.phaseDecision.regulatoryRecommendation, "THREE");
  assert.equal(gurugram.phaseDecision.connectedLoadThresholdKw, 5);
  assert.equal(gurugram.phaseDecision.supplyAuthority, "Haryana (HERC)");

  assert.equal(noida.phaseDecision.regulatoryRecommendation, "THREE");
  assert.equal(noida.phaseDecision.supplyAuthority, "Uttar Pradesh (UPERC)");
});

run("At exactly 5 kW, UP (5 kW or more) goes three phase and Haryana (above 5 kW) does not", () => {
  const gurugram = calculateBOM(makeInput("Gurugram", loadOnly(2, 4)));
  const noida = calculateBOM(makeInput("Noida", loadOnly(2, 4)));

  assert.equal(gurugram.totalConnectedLoadKw, 5);
  assert.equal(gurugram.phaseDecision.regulatoryRecommendation, "SINGLE");
  assert.equal(noida.phaseDecision.regulatoryRecommendation, "THREE");
  assert.equal(noida.phaseDecision.threePhaseAtThreshold, true);
  assert.ok(noida.warnings.some((w) => w.includes("Uttar Pradesh (UPERC) supplies three phase from 5 kW")));
});

run("NCR without a city follows the Delhi rule", () => {
  const ncr = calculateBOM(makeInput("NCR", loadOnly(4)));
  assert.equal(ncr.phaseDecision.connectedLoadThresholdKw, 10);
  assert.equal(ncr.phaseDecision.regulatoryRecommendation, "SINGLE");
});

// ---------------------------------------------------------------------------
// The parts list and the board schedule agree
// ---------------------------------------------------------------------------

function mainParts(result: ReturnType<typeof calculateBOM>) {
  const schedule = buildDistributionSchedule({
    circuits: result.circuits,
    supply: result.phaseDecision.finalRecommendation,
    maxDemandKw: result.maxDemandKw,
  });
  const mainSwitch = result.items.find((i) => i.category === "MAIN_SWITCH");
  const rccb = result.items.find((i) => i.category === "RCCB");
  assert.ok(mainSwitch && mainSwitch.category === "MAIN_SWITCH");
  assert.ok(rccb && rccb.category === "RCCB");
  return { schedule, mainSwitch, rccb };
}

run("Single phase: the 40 A main switch matches the board incomer and the RCCB", () => {
  const result = calculateBOM(makeInput("Delhi", loadOnly(2)));
  assert.equal(result.recommendedPhase, "SINGLE");
  const { schedule, mainSwitch, rccb } = mainParts(result);
  assert.equal(mainSwitch.ratingAmps, 40);
  assert.equal(mainSwitch.ratingAmps, schedule.incomer.ratingAmps);
  assert.equal(rccb.ratingAmps, schedule.incomer.rccb.ratingAmps);
  assert.equal(mainSwitch.pricingCode, "MAIN_SWITCH_40A_DP");
});

run("Three phase: the 63 A main switch matches the board incomer and the RCCB", () => {
  const result = calculateBOM(makeInput("Gurugram", loadOnly(4)));
  assert.equal(result.recommendedPhase, "THREE");
  const { schedule, mainSwitch, rccb } = mainParts(result);
  assert.equal(mainSwitch.ratingAmps, 63);
  assert.equal(mainSwitch.ratingAmps, schedule.incomer.ratingAmps);
  assert.equal(rccb.ratingAmps, schedule.incomer.rccb.ratingAmps);
});

run("The main feeder cable can carry its main breaker (fire-guard ceiling)", () => {
  const single = calculateBOM(makeInput("Delhi", loadOnly(2)));
  const three = calculateBOM(makeInput("Gurugram", loadOnly(4)));
  const gauges = (r: ReturnType<typeof calculateBOM>) =>
    r.items.filter((i) => i.category === "WIRE").map((i) => (i.category === "WIRE" ? i.wireGauge : ""));

  // No room circuit uses 10 or 16 mm², so these come from the feeder alone.
  assert.ok(gauges(single).includes("10.0"), "40 A single-phase main needs a 10 mm² feeder");
  assert.ok(!gauges(single).includes("6.0"), "6 mm² is capped at 32 A, below the 40 A main");
  assert.ok(MAX_BREAKER_FOR_GAUGE["10.0"] >= 40);
  assert.ok(gauges(three).includes("16.0"), "63 A three-phase main needs a 16 mm² feeder");
  assert.ok(MAX_BREAKER_FOR_GAUGE["16.0"] >= 63);
});

run("Lighting circuits are 10 A Type B, the shared constant", () => {
  const result = calculateBOM(
    makeInput("Delhi", [
      makeRoom(
        {
          name: "Bedroom",
          type: "BEDROOM",
          floor: 0,
          lengthFt: 12,
          widthFt: 10,
          lightPoints: 3,
          fanPoints: 1,
          socket5A: 4,
          socket15A: 0,
          heavyAppliances: 0,
          exhaustFan: 0,
        },
        "lighting-room"
      ),
    ])
  );
  const lighting = result.circuits.filter((c) => c.circuitType === "LIGHTING");
  assert.ok(lighting.length > 0);
  assert.ok(lighting.every((c) => c.mcbRatingAmps === 10));
  assert.equal(CIRCUIT_TYPES.LIGHTING.mcbRatingAmps, 10);
  assert.equal(CIRCUIT_TYPES.LIGHTING.mcbType, "B");
  assert.ok(result.items.some((i) => i.pricingCode === "MCB_10A_B"));
});

run("Room dimensions never change the bill: cable is sized per point", () => {
  const room = (lengthFt: number, widthFt: number) =>
    makeRoom(
      {
        name: "Bedroom",
        type: "BEDROOM",
        floor: 0,
        lengthFt,
        widthFt,
        lightPoints: 3,
        fanPoints: 1,
        socket5A: 3,
        socket15A: 1,
        heavyAppliances: 1,
        exhaustFan: 0,
      },
      "size-room"
    );
  const asRead = calculateBOM(makeInput("Delhi", [room(12, 10)]));
  const misread = calculateBOM(makeInput("Delhi", [room(18, 15)]));
  assert.deepEqual(misread.items, asRead.items);
  assert.equal(misread.totalCircuits, asRead.totalCircuits);
});
