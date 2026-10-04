// src/features/vision/toCalculator.ts
// ============================================================================
// FLOOR PLAN → CALCULATOR
// ============================================================================
// Hands a validated extraction to the existing deterministic engine. Two
// outputs, for two stages of the product:
//   rooms   RoomSpec[] for the rooms actually drawn, with their dimensions,
//           for buildCalculatorInputFromRooms() and calculateBOM(). The
//           engine sizes cable per point, not per square foot, so what the
//           plan changes is the room list: how many rooms, of which type,
//           with which appliances. Sizes feed the area cross-check below.
//   layout  The same house as a LayoutInput (counts and toggles). The
//           calculator form already accepts one: it is what a preset's
//           Customise button prefills. That is the handoff today's UI can
//           take, with the person checking it before anything is saved.
//
// No electrical rule lives here. Point counts come from ROOM_DEFAULTS;
// circuits, breakers and cable sizes from calculateBOM(). This file only
// decides which room type each drawn room is, and how many heavy-appliance
// circuits it gets:
//   - Appliances marked on the plan: each room gets exactly its marked ACs
//     and geysers.
//   - None marked: each room keeps its type's default, the same provision
//     the form's AC and geyser toggles give (bedroom and living: one AC;
//     attached bathroom: one geyser; common bathroom: none).
//   - Kitchens keep their own default. A marked cooking range makes one a
//     modular kitchen with a cooking-range circuit.
// ============================================================================

import { ROOM_DEFAULTS } from "../calculator/constants";
import { layoutSchema } from "../calculator/schemas";
import type { LayoutInput } from "../calculator/layoutTypes";
import type { RoomSpec } from "../calculator/type";
import type { FloorPlanExtraction, FloorPlanRoom } from "./floorPlan";

const FT_PER_M = 1 / 0.3048;

/** A side outside this, in feet, is a misread, not a room. */
const MIN_SIDE_FT = 2;
const MAX_SIDE_FT = 80;

/** Beyond this gap between the rooms' sum and the printed total, something was misread. */
const AREA_MISMATCH = 0.4;

type DrawnType = Exclude<FloorPlanRoom["type"], "OTHER">;

/** Engine room type for each drawn type; kitchens and bathrooms are refined below. */
const ENGINE_TYPE: Record<DrawnType, string> = {
  MASTER_BEDROOM: "BEDROOM_MASTER",
  BEDROOM: "BEDROOM",
  STUDY: "BEDROOM",
  LIVING: "LIVING_ROOM",
  DINING: "DINING",
  KITCHEN: "KITCHEN",
  BATHROOM: "BATHROOM",
  BALCONY: "BALCONY",
  POOJA: "POOJA_ROOM",
  STORE: "STORE_ROOM",
  SERVANT_ROOM: "SERVANT_ROOM",
  PASSAGE: "PASSAGE",
  STAIRCASE: "STAIRCASE",
  PARKING: "PARKING",
};

const BEDROOM_TYPES = new Set(["BEDROOM_MASTER", "BEDROOM"]);
const BATHROOM_TYPES = new Set(["BATHROOM", "BATHROOM_COMMON"]);
const KITCHEN_TYPES = new Set(["KITCHEN", "KITCHEN_MODULAR"]);

export type PlanSummary = {
  /** Sum of the mapped rooms' floor areas, in sq ft. */
  totalSqFt: number;
  roomCount: number;
  bathroomCount: number;
  /** Dedicated heavy-appliance circuits across all rooms. */
  heavyApplianceCircuits: number;
  /** Whether those circuits follow the plan's markings or the room defaults. */
  applianceSource: "PLAN" | "DEFAULTS";
};

export type PlanHandoff = {
  rooms: RoomSpec[];
  /** Null when the house cannot be expressed in the form's ranges. */
  layout: LayoutInput | null;
  summary: PlanSummary;
  /** Plain-language points for a person to check before calculating. */
  warnings: string[];
};

function toFeet(value: number, unit: FloorPlanRoom["unit"]): number {
  const feet = unit === "M" ? value * FT_PER_M : value;
  return Math.round(feet * 10) / 10;
}

function count<T>(items: readonly T[], match: (item: T) => boolean): number {
  return items.reduce((n, item) => (match(item) ? n + 1 : n), 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function floorPlanToCalculator(plan: FloorPlanExtraction): PlanHandoff {
  const warnings: string[] = [];
  const kept: Array<{ drawn: FloorPlanRoom; type: string; lengthFt: number; widthFt: number }> = [];

  for (const drawn of plan.rooms) {
    if (drawn.type === "OTHER") {
      warnings.push(`"${drawn.name}" skipped: not a room type the estimate covers. Add it by hand if it needs power.`);
      continue;
    }

    const a = toFeet(drawn.length, drawn.unit);
    const b = toFeet(drawn.width, drawn.unit);
    const lengthFt = Math.max(a, b);
    const widthFt = Math.min(a, b);
    if (widthFt < MIN_SIDE_FT || lengthFt > MAX_SIDE_FT) {
      warnings.push(`"${drawn.name}" skipped: ${lengthFt} × ${widthFt} ft looks misread.`);
      continue;
    }
    if (!drawn.dimensionsLabelled) {
      warnings.push(`"${drawn.name}": size estimated from the drawing, not labelled on it. Check ${lengthFt} × ${widthFt} ft.`);
    }

    let type = ENGINE_TYPE[drawn.type];
    if (type === "KITCHEN" && drawn.appliances.includes("COOKING_RANGE")) type = "KITCHEN_MODULAR";
    if (type === "BATHROOM" && !drawn.attachedToBedroom) type = "BATHROOM_COMMON";

    kept.push({ drawn, type, lengthFt, widthFt });
  }

  // Like the form's bridge, a house always has a master bedroom: with none
  // marked, the largest bedroom is promoted.
  if (!kept.some((room) => room.type === "BEDROOM_MASTER")) {
    const bedrooms = kept.filter((room) => room.drawn.type === "BEDROOM");
    if (bedrooms.length > 0) {
      const largest = bedrooms.reduce((big, room) =>
        room.lengthFt * room.widthFt > big.lengthFt * big.widthFt ? room : big
      );
      largest.type = "BEDROOM_MASTER";
    }
  }

  const rooms: RoomSpec[] = kept.map(({ drawn, type, lengthFt, widthFt }, i) => {
    const defaults = ROOM_DEFAULTS[type];
    const marked = count(drawn.appliances, (a) => a === "AC" || a === "GEYSER");
    const heavyAppliances =
      plan.appliancesMarked && !KITCHEN_TYPES.has(type) ? marked : defaults.heavyAppliances;

    return {
      id: `plan-${i + 1}`,
      name: drawn.name,
      type,
      floor: drawn.floor,
      lengthFt,
      widthFt,
      lightPoints: defaults.lightPoints,
      fanPoints: defaults.fanPoints,
      socket5A: defaults.socket5A,
      socket15A: defaults.socket15A,
      heavyAppliances,
      exhaustFan: defaults.exhaustFan,
      hasCookingRange: type === "KITCHEN_MODULAR" ? true : undefined,
    };
  });

  const totalSqFt = Math.round(rooms.reduce((sum, r) => sum + r.lengthFt * r.widthFt, 0));
  if (plan.statedTotalSqFt && Math.abs(totalSqFt - plan.statedTotalSqFt) / plan.statedTotalSqFt > AREA_MISMATCH) {
    warnings.push(
      `The rooms add up to ${totalSqFt} sq ft but the plan states ${plan.statedTotalSqFt} sq ft. Check for missed rooms or a misread unit.`
    );
  }

  const summary: PlanSummary = {
    totalSqFt,
    roomCount: rooms.length,
    bathroomCount: count(rooms, (r) => BATHROOM_TYPES.has(r.type)),
    heavyApplianceCircuits: rooms.reduce((sum, r) => sum + r.heavyAppliances, 0),
    applianceSource: plan.appliancesMarked ? "PLAN" : "DEFAULTS",
  };

  // Counted from the drawn types: a study uses the bedroom template but is
  // not a bedroom on the form.
  const bedroomCount = count(kept, (k) => k.drawn.type === "MASTER_BEDROOM" || k.drawn.type === "BEDROOM");

  return {
    rooms,
    layout: toLayout({ plan, rooms, totalSqFt, bedroomCount, warnings }),
    summary,
    warnings,
  };
}

/**
 * The house as the calculator form sees it. Lossy by design: the form has no
 * room sizes, and caps bedrooms at 5, bathrooms at 4 and floors at 2. A cap
 * reached is reported, never silently applied.
 */
function toLayout({
  plan,
  rooms,
  totalSqFt,
  bedroomCount,
  warnings,
}: {
  plan: FloorPlanExtraction;
  rooms: RoomSpec[];
  totalSqFt: number;
  bedroomCount: number;
  warnings: string[];
}): LayoutInput | null {
  const bathroomCount = count(rooms, (r) => BATHROOM_TYPES.has(r.type));
  const floors = new Set(rooms.map((r) => r.floor)).size;

  const bedrooms = clamp(bedroomCount, 1, 5);
  const bathrooms = clamp(bathroomCount, 1, Math.min(4, bedrooms + 1));
  const totalFloors = clamp(floors, 1, 2);

  if (bedroomCount !== bedrooms) warnings.push(`Form shows ${bedrooms} bedroom(s); the plan has ${bedroomCount}.`);
  if (bathroomCount !== bathrooms) warnings.push(`Form shows ${bathrooms} bathroom(s); the plan has ${bathroomCount}.`);
  if (floors !== totalFloors) warnings.push(`Form shows ${totalFloors} floor(s); the plan has ${floors}.`);

  const candidate: LayoutInput = {
    propertyType: totalFloors >= 2 ? "DUPLEX" : "FLAT",
    bedrooms,
    bathrooms,
    balconies: clamp(count(rooms, (r) => r.type === "BALCONY"), 0, 3),
    totalFloors,
    approxSqFt: plan.statedTotalSqFt ?? (totalSqFt > 0 ? totalSqFt : undefined),
    modularKitchen: rooms.some((r) => r.type === "KITCHEN_MODULAR"),
    acInBedrooms: rooms.some((r) => BEDROOM_TYPES.has(r.type) && r.heavyAppliances > 0),
    acInLivingRoom: rooms.some((r) => r.type === "LIVING_ROOM" && r.heavyAppliances > 0),
    geyserInBathrooms: rooms.some((r) => BATHROOM_TYPES.has(r.type) && r.heavyAppliances > 0),
  };

  const parsed = layoutSchema.safeParse(candidate);
  if (!parsed.success) {
    warnings.push(`This plan does not fit the calculator form: ${parsed.error.issues.map((i) => i.message).join("; ")}.`);
    return null;
  }
  return parsed.data;
}
