import assert from "node:assert/strict";
import { calculateBOM } from "../calculator/calculateBOM";
import { ROOM_DEFAULTS } from "../calculator/constants";
import { buildCalculatorInput, buildCalculatorInputFromRooms } from "../calculator/generateRoomSpecs";
import { layoutSchema } from "../calculator/schemas";
import { floorPlanExtractionSchema, type FloorPlanExtraction, type FloorPlanRoom } from "./floorPlan";
import { floorPlanToCalculator } from "./toCalculator";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

function room(
  name: string,
  type: FloorPlanRoom["type"],
  length: number,
  width: number,
  extra: Partial<FloorPlanRoom> = {}
): FloorPlanRoom {
  return {
    name,
    type,
    floor: 0,
    length,
    width,
    unit: "FT",
    dimensionsLabelled: true,
    attachedToBedroom: false,
    appliances: [],
    ...extra,
  };
}

function plan(rooms: FloorPlanRoom[], extra: Partial<FloorPlanExtraction> = {}): FloorPlanExtraction {
  return floorPlanExtractionSchema.parse({
    isFloorPlan: true,
    appliancesMarked: false,
    statedTotalSqFt: null,
    rooms,
    notes: [],
    ...extra,
  });
}

// A 2BHK flat drawn at exactly the calculator's NCR template sizes.
const FLAT_2BHK = plan([
  room("Master Bedroom", "MASTER_BEDROOM", 14, 12),
  room("Bedroom 2", "BEDROOM", 12, 10),
  room("Living Room", "LIVING", 16, 12),
  room("Kitchen", "KITCHEN", 10, 8),
  room("Master Bathroom", "BATHROOM", 7, 5, { attachedToBedroom: true }),
  room("Common Bathroom", "BATHROOM", 6, 5),
  room("Balcony", "BALCONY", 10, 4),
  room("Passage", "PASSAGE", 8, 4),
]);

run("a plan drawn at template sizes reaches the engine exactly as the form's 2BHK does", () => {
  const handoff = floorPlanToCalculator(FLAT_2BHK);
  const fromPlan = calculateBOM(buildCalculatorInputFromRooms(handoff.rooms, { projectName: "plan" }));
  const fromForm = calculateBOM(
    buildCalculatorInput({
      propertyType: "FLAT",
      bedrooms: 2,
      bathrooms: 2,
      balconies: 1,
      totalFloors: 1,
      modularKitchen: false,
      acInBedrooms: true,
      acInLivingRoom: true,
      geyserInBathrooms: true,
    })
  );
  assert.equal(fromPlan.totalCircuits, fromForm.totalCircuits);
  assert.equal(fromPlan.totalConnectedLoadKw, fromForm.totalConnectedLoadKw);
  assert.equal(fromPlan.maxDemandKw, fromForm.maxDemandKw);
  assert.equal(handoff.warnings.length, 0, handoff.warnings.join(" | "));
});

run("the same plan becomes a valid calculator-form layout", () => {
  const { layout, summary } = floorPlanToCalculator(FLAT_2BHK);
  assert.deepEqual(layout, {
    propertyType: "FLAT",
    bedrooms: 2,
    bathrooms: 2,
    balconies: 1,
    totalFloors: 1,
    approxSqFt: 697,
    modularKitchen: false,
    acInBedrooms: true,
    acInLivingRoom: true,
    geyserInBathrooms: true,
  });
  assert.ok(layoutSchema.safeParse(layout).success);
  assert.equal(summary.roomCount, 8);
  assert.equal(summary.bathroomCount, 2);
  assert.equal(summary.applianceSource, "DEFAULTS");
});

run("point counts come from the engine's IS 732 room defaults, not the model", () => {
  const living = floorPlanToCalculator(FLAT_2BHK).rooms.find((r) => r.type === "LIVING_ROOM");
  assert.equal(living?.lightPoints, ROOM_DEFAULTS.LIVING_ROOM.lightPoints);
  assert.equal(living?.socket15A, ROOM_DEFAULTS.LIVING_ROOM.socket15A);
});

run("metres convert to feet in code, and the longer side becomes the length", () => {
  const [r] = floorPlanToCalculator(plan([room("Bed", "BEDROOM", 3.6, 4.2, { unit: "M" })])).rooms;
  assert.equal(r.lengthFt, 13.8);
  assert.equal(r.widthFt, 11.8);
});

run("marked appliances are followed exactly; unmarked rooms get none", () => {
  const { rooms, layout, summary } = floorPlanToCalculator(
    plan(
      [
        room("Bed 1", "BEDROOM", 14, 12, { appliances: ["AC"] }),
        room("Bed 2", "BEDROOM", 12, 10),
        room("Toilet 1", "BATHROOM", 7, 5, { attachedToBedroom: true, appliances: ["GEYSER"] }),
        room("Toilet 2", "BATHROOM", 6, 5, { attachedToBedroom: true }),
        room("Kitchen", "KITCHEN", 10, 8, { appliances: ["COOKING_RANGE"] }),
      ],
      { appliancesMarked: true }
    )
  );
  const by = (name: string) => rooms.find((r) => r.name === name)!;
  assert.equal(by("Bed 1").heavyAppliances, 1);
  assert.equal(by("Bed 2").heavyAppliances, 0);
  assert.equal(by("Toilet 1").heavyAppliances, 1);
  assert.equal(by("Toilet 2").heavyAppliances, 0);
  assert.equal(by("Kitchen").type, "KITCHEN_MODULAR");
  assert.equal(by("Kitchen").hasCookingRange, true);
  assert.equal(summary.applianceSource, "PLAN");
  assert.equal(layout?.modularKitchen, true);
});

run("with no master marked, the largest bedroom is promoted", () => {
  const { rooms } = floorPlanToCalculator(
    plan([room("Bed A", "BEDROOM", 12, 10), room("Bed B", "BEDROOM", 14, 12)])
  );
  assert.equal(rooms.find((r) => r.name === "Bed B")?.type, "BEDROOM_MASTER");
  assert.equal(rooms.find((r) => r.name === "Bed A")?.type, "BEDROOM");
});

run("unknown spaces and misread sizes are skipped with a warning; estimated sizes are flagged", () => {
  const { rooms, warnings } = floorPlanToCalculator(
    plan([
      room("Bedroom", "BEDROOM", 12, 10, { dimensionsLabelled: false }),
      room("Shaft", "OTHER", 3, 3),
      room("Hall", "LIVING", 150, 12),
    ])
  );
  assert.deepEqual(rooms.map((r) => r.name), ["Bedroom"]);
  assert.ok(warnings.some((w) => w.includes('"Shaft" skipped')));
  assert.ok(warnings.some((w) => w.includes('"Hall" skipped')));
  assert.ok(warnings.some((w) => w.includes('"Bedroom": size estimated')));
});

run("a printed total far from the rooms' sum is flagged", () => {
  const { warnings } = floorPlanToCalculator({ ...FLAT_2BHK, statedTotalSqFt: 2000 });
  assert.ok(warnings.some((w) => w.includes("states 2000 sq ft")));
});

run("a study uses the bedroom template but is not counted as a bedroom on the form", () => {
  const { rooms, layout } = floorPlanToCalculator(
    plan([room("Bed", "MASTER_BEDROOM", 14, 12), room("Study", "STUDY", 10, 9), room("Toilet", "BATHROOM", 7, 5)])
  );
  assert.equal(rooms.find((r) => r.name === "Study")?.type, "BEDROOM");
  assert.equal(layout?.bedrooms, 1);
});

run("the form's caps are reported, never silently applied", () => {
  const bedrooms = Array.from({ length: 6 }, (_, i) => room(`Bed ${i + 1}`, "BEDROOM", 12, 10));
  const { layout, warnings } = floorPlanToCalculator(plan([...bedrooms, room("Toilet", "BATHROOM", 7, 5)]));
  assert.equal(layout?.bedrooms, 5);
  assert.ok(warnings.some((w) => w.includes("Form shows 5 bedroom(s); the plan has 6.")));
});
