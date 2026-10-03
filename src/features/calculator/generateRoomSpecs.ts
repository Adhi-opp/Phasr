// src/features/calculator/generateRoomSpecs.ts
// ============================================================================
// LAYOUT BRIDGE: Homeowner Input → RoomSpec[] → calculateBOM()
// ============================================================================
// This is the translation layer between the simple homeowner form (LayoutInput)
// and the engineering-grade BOM engine (calculateBOM).
//
// Architecture:
//   UI Form → LayoutInput → generateRoomSpecsFromLayout() → RoomSpec[]
//                                                              ↓
//                                          buildCalculatorInput() → CalculatorInput
//                                                              ↓
//                                                      calculateBOM() → BOMResult
//
// DESIGN RULES:
//   1. NEVER modify calculateBOM() — this function adapts TO the engine, not the reverse.
//   2. NEVER duplicate electrical logic — all engineering rules live in the engine.
//   3. supplyPhase is ALWAYS set to "SINGLE" — the engine auto-determines and warns
//      if three-phase is needed. This prevents double phase-decision logic.
//   4. Output is deterministic — same LayoutInput always produces same RoomSpec[].
// ============================================================================

import type { CalculatorInput, RoomSpec } from "./type";
import type { LayoutInput } from "./layoutTypes";
import { NCR_TEMPLATES, DUPLEX_ADJUSTMENTS, type RoomTemplate } from "./roomTemplates";

// ---------------------------------------------------------------------------
// Room ID generator — deterministic within a single call
// ---------------------------------------------------------------------------

let _roomCounter = 0;

function resetCounter(): void {
  _roomCounter = 0;
}

// ---------------------------------------------------------------------------
// Room factory — creates a RoomSpec from a template + optional overrides
// ---------------------------------------------------------------------------

interface RoomOverrides {
  lightPoints?: number;
  fanPoints?: number;
  socket5A?: number;
  socket15A?: number;
  heavyAppliances?: number;
  exhaustFan?: number;
  hasCookingRange?: boolean;
  lengthFt?: number;
  widthFt?: number;
}

function createRoom(
  template: RoomTemplate,
  name: string,
  floor: number,
  overrides?: RoomOverrides
): RoomSpec {
  _roomCounter++;
  return {
    id: `layout-${_roomCounter}`,
    name,
    type: template.type,
    floor,
    lengthFt: overrides?.lengthFt ?? template.defaultLengthFt,
    widthFt: overrides?.widthFt ?? template.defaultWidthFt,
    lightPoints: overrides?.lightPoints ?? template.lightPoints,
    fanPoints: overrides?.fanPoints ?? template.fanPoints,
    socket5A: overrides?.socket5A ?? template.socket5A,
    socket15A: overrides?.socket15A ?? template.socket15A,
    heavyAppliances: overrides?.heavyAppliances ?? template.heavyAppliances,
    exhaustFan: overrides?.exhaustFan ?? template.exhaustFan,
    hasCookingRange: overrides?.hasCookingRange,
  };
}

// ============================================================================
// MAIN BRIDGE FUNCTION
// ============================================================================

/**
 * Translates homeowner-friendly LayoutInput into engine-compatible RoomSpec[].
 *
 * Room generation logic:
 *   - First bedroom is always promoted to Master Bedroom
 *   - Bathrooms: attached (with geyser) on bedroom floor, guest (no geyser) on ground floor
 *   - Duplex: bedrooms/attached baths on F1, common areas on F0, staircase auto-added
 *   - Dining room auto-added for duplex with 3+ bedrooms
 *   - Passage auto-added for 2+ bedrooms
 *   - AC/geyser toggles control heavyAppliances count per room
 *   - Duplex properties get adjusted point counts for larger room sizes
 *   - 3BHK+ flats get a slightly bumped living room (combined living+dining space)
 */
export function generateRoomSpecsFromLayout(input: LayoutInput): RoomSpec[] {
  resetCounter();
  const rooms: RoomSpec[] = [];

  const isDuplex = input.totalFloors >= 2;
  const bedroomFloor = isDuplex ? 1 : 0;
  const groundFloor = 0;

  // -----------------------------------------------------------------------
  // 1. BEDROOMS
  //    First bedroom is always promoted to Master Bedroom (larger template).
  //    AC toggle controls heavyAppliances (1 = AC provision, 0 = no AC).
  // -----------------------------------------------------------------------

  const masterTemplate = NCR_TEMPLATES.BEDROOM_MASTER;
  const masterOverrides: RoomOverrides = {};

  if (!input.acInBedrooms) {
    masterOverrides.heavyAppliances = 0;
  }

  if (isDuplex) {
    const adj = DUPLEX_ADJUSTMENTS.BEDROOM_MASTER;
    masterOverrides.lightPoints = masterTemplate.lightPoints + adj.additionalLightPoints;
    masterOverrides.socket5A = masterTemplate.socket5A + adj.additionalSocket5A;
    masterOverrides.socket15A = masterTemplate.socket15A + adj.additionalSocket15A;
    masterOverrides.lengthFt = adj.lengthFt;
    masterOverrides.widthFt = adj.widthFt;
    // Duplex master bedrooms keep base heavyAppliances=1 for AC (unless toggle off)
    if (!input.acInBedrooms) {
      masterOverrides.heavyAppliances = 0;
    }
  }

  rooms.push(createRoom(masterTemplate, "Master Bedroom", bedroomFloor, masterOverrides));

  // Additional bedrooms
  const bedroomTemplate = NCR_TEMPLATES.BEDROOM;
  for (let i = 2; i <= input.bedrooms; i++) {
    const overrides: RoomOverrides = {};

    if (!input.acInBedrooms) {
      overrides.heavyAppliances = 0;
    }

    if (isDuplex) {
      const adj = DUPLEX_ADJUSTMENTS.BEDROOM;
      overrides.lightPoints = bedroomTemplate.lightPoints + adj.additionalLightPoints;
      overrides.socket5A = bedroomTemplate.socket5A + adj.additionalSocket5A;
      overrides.lengthFt = adj.lengthFt;
      overrides.widthFt = adj.widthFt;
      // Keep base heavyAppliances=1 for AC (unless toggle off — already handled above)
    }

    rooms.push(createRoom(bedroomTemplate, `Bedroom ${i}`, bedroomFloor, overrides));
  }

  // -----------------------------------------------------------------------
  // 2. LIVING ROOM
  //    Duplex: larger open-plan space with additional points and 2× AC.
  //    3BHK+ flat: slightly bumped for combined living+dining open layout.
  // -----------------------------------------------------------------------

  const livingTemplate = NCR_TEMPLATES.LIVING_ROOM;

  if (isDuplex) {
    const adj = DUPLEX_ADJUSTMENTS.LIVING_ROOM;
    rooms.push(createRoom(livingTemplate, "Living Room", groundFloor, {
      lightPoints: livingTemplate.lightPoints + adj.additionalLightPoints,
      socket5A: livingTemplate.socket5A + adj.additionalSocket5A,
      socket15A: livingTemplate.socket15A + adj.additionalSocket15A,
      heavyAppliances: input.acInLivingRoom ? adj.heavyAppliances : 0,
      lengthFt: adj.lengthFt,
      widthFt: adj.widthFt,
    }));
  } else if (input.bedrooms >= 3) {
    // 3BHK+ flats in NCR typically have open living+dining layout.
    // Bump by 1 light + 1 socket to account for the dining zone.
    rooms.push(createRoom(livingTemplate, "Living Room", groundFloor, {
      lightPoints: livingTemplate.lightPoints + 1,
      socket5A: livingTemplate.socket5A + 1,
      heavyAppliances: input.acInLivingRoom ? livingTemplate.heavyAppliances : 0,
    }));
  } else {
    rooms.push(createRoom(livingTemplate, "Living Room", groundFloor, {
      heavyAppliances: input.acInLivingRoom ? livingTemplate.heavyAppliances : 0,
    }));
  }

  // -----------------------------------------------------------------------
  // 3. DINING ROOM (duplex with 3+ bedrooms only)
  //    In non-duplex properties, dining is absorbed into the living room.
  // -----------------------------------------------------------------------

  if (isDuplex && input.bedrooms >= 3) {
    const diningTemplate = NCR_TEMPLATES.DINING;
    const adj = DUPLEX_ADJUSTMENTS.DINING;
    rooms.push(createRoom(diningTemplate, "Dining Area", groundFloor, {
      lightPoints: diningTemplate.lightPoints + (adj.additionalLightPoints ?? 0),
      socket15A: diningTemplate.socket15A + (adj.additionalSocket15A ?? 0),
    }));
  }

  // -----------------------------------------------------------------------
  // 4. KITCHEN
  //    Standard kitchen (gas stove) vs Modular kitchen (chimney/hob provision).
  //    Duplex modular kitchens get additional points + cooking range provision.
  // -----------------------------------------------------------------------

  if (input.modularKitchen) {
    const kitchenTemplate = NCR_TEMPLATES.KITCHEN_MODULAR;

    if (isDuplex) {
      const adj = DUPLEX_ADJUSTMENTS.KITCHEN_MODULAR;
      rooms.push(createRoom(kitchenTemplate, "Modular Kitchen", groundFloor, {
        lightPoints: kitchenTemplate.lightPoints + adj.additionalLightPoints,
        socket5A: kitchenTemplate.socket5A + adj.additionalSocket5A,
        socket15A: kitchenTemplate.socket15A + adj.additionalSocket15A,
        hasCookingRange: adj.hasCookingRange,
        lengthFt: adj.lengthFt,
        widthFt: adj.widthFt,
      }));
    } else {
      rooms.push(createRoom(kitchenTemplate, "Modular Kitchen", groundFloor));
    }
  } else {
    rooms.push(createRoom(NCR_TEMPLATES.KITCHEN, "Kitchen", groundFloor));
  }

  // -----------------------------------------------------------------------
  // 5. BATHROOMS
  //    Geyser logic: attached bathrooms get geyser, guest/common does not.
  //    Rule: if geyserInBathrooms=true, (bathrooms-1) get geyser, 1 is guest.
  //          if only 1 bathroom, it gets geyser.
  //          if geyserInBathrooms=false, all are common (no geyser).
  //    Floor: geyser bathrooms on bedroom floor, guest bathroom on ground floor.
  // -----------------------------------------------------------------------

  const numGeyserBaths = input.geyserInBathrooms
    ? Math.min(Math.max(input.bathrooms - 1, 1), input.bathrooms)
    : 0;
  const numCommonBaths = input.bathrooms - numGeyserBaths;

  // Geyser bathrooms (attached to bedrooms, on bedroom floor)
  for (let i = 1; i <= numGeyserBaths; i++) {
    const name = i === 1 ? "Master Bathroom" : `Bathroom ${i}`;
    const bathTemplate = NCR_TEMPLATES.BATHROOM;

    if (isDuplex) {
      const adj = DUPLEX_ADJUSTMENTS.BATHROOM;
      rooms.push(createRoom(bathTemplate, name, bedroomFloor, {
        lightPoints: bathTemplate.lightPoints + (adj.additionalLightPoints ?? 0),
        lengthFt: adj.lengthFt,
        widthFt: adj.widthFt,
      }));
    } else {
      rooms.push(createRoom(bathTemplate, name, bedroomFloor));
    }
  }

  // Common/guest bathrooms (no geyser, on ground floor for duplex)
  for (let i = 1; i <= numCommonBaths; i++) {
    const name = numCommonBaths === 1 ? "Common Bathroom" : `Guest Bathroom ${i}`;
    rooms.push(createRoom(
      NCR_TEMPLATES.BATHROOM_COMMON,
      name,
      isDuplex ? groundFloor : groundFloor // flat: floor 0 anyway
    ));
  }

  // -----------------------------------------------------------------------
  // 6. BALCONIES
  //    Duplex balconies get additional lighting for larger area.
  // -----------------------------------------------------------------------

  for (let i = 1; i <= input.balconies; i++) {
    const name = input.balconies === 1 ? "Balcony" : `Balcony ${i}`;
    const balconyTemplate = NCR_TEMPLATES.BALCONY;

    if (isDuplex) {
      const adj = DUPLEX_ADJUSTMENTS.BALCONY;
      rooms.push(createRoom(balconyTemplate, name, bedroomFloor, {
        lightPoints: balconyTemplate.lightPoints + (adj.additionalLightPoints ?? 0),
        lengthFt: adj.lengthFt,
        widthFt: adj.widthFt,
      }));
    } else {
      rooms.push(createRoom(balconyTemplate, name, groundFloor));
    }
  }

  // -----------------------------------------------------------------------
  // 7. PASSAGE (auto-added for 2+ bedrooms)
  //    3+ bedrooms get additional light for longer corridor.
  // -----------------------------------------------------------------------

  if (input.bedrooms >= 2) {
    const passageTemplate = NCR_TEMPLATES.PASSAGE;
    const overrides: RoomOverrides = {};

    if (input.bedrooms >= 3) {
      // 3+ bedrooms = longer passage, needs 2 lights (one per end)
      overrides.lightPoints = 2;
    }

    rooms.push(createRoom(passageTemplate, "Passage", bedroomFloor, overrides));
  }

  // -----------------------------------------------------------------------
  // 8. STAIRCASE (auto-added for duplex)
  //    Two-way switching for top and bottom. No user input needed.
  // -----------------------------------------------------------------------

  if (isDuplex) {
    rooms.push(createRoom(NCR_TEMPLATES.STAIRCASE, "Staircase", groundFloor));
  }

  return rooms;
}

// ============================================================================
// CALCULATOR INPUT BUILDER
// ============================================================================

/**
 * Builds a complete CalculatorInput from homeowner-friendly LayoutInput.
 *
 * IMPORTANT: supplyPhase is ALWAYS set to "SINGLE".
 * The engine's calculateBOM() independently determines recommendedPhase based
 * on load calculation and issues a warning if three-phase is needed.
 * This prevents duplicating phase-decision logic outside the engine.
 */
export function buildCalculatorInput(layout: LayoutInput): CalculatorInput {
  const rooms = generateRoomSpecsFromLayout(layout);
  const city = layout.city || "NCR";

  return buildCalculatorInputFromRooms(rooms, {
    projectName: `${layout.bedrooms}BHK ${layout.propertyType} - ${city}`,
    city,
    totalFloors: layout.totalFloors,
  });
}

/**
 * The same CalculatorInput around a RoomSpec[] that did not come from a
 * LayoutInput — the floor-plan extractor's rooms (features/vision), which
 * carry the drawing's real dimensions. Same defaults as above, supplyPhase
 * "SINGLE" included, so the engine makes every phase decision.
 */
export function buildCalculatorInputFromRooms(
  rooms: RoomSpec[],
  {
    projectName,
    city,
    totalFloors,
  }: { projectName: string; city?: string; totalFloors?: number }
): CalculatorInput {
  return {
    projectName,
    propertyType: "RESIDENTIAL",
    city: city || "NCR",
    pincode: "",
    totalFloors: totalFloors ?? Math.max(0, ...rooms.map((room) => room.floor)) + 1,
    rooms,
    supplyPhase: "SINGLE",
    dbLocation: "NEAR_ENTRANCE",
    dbFloor: 0,
  };
}
