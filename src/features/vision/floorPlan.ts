// src/features/vision/floorPlan.ts
// ============================================================================
// FLOOR-PLAN EXTRACTION — THE CONTRACT WITH THE VISION MODEL
// ============================================================================
// What the model may say about a drawing, and nothing more. The model
// transcribes what is drawn; code does every calculation:
//   - Dimensions come back as written, with their unit, and code converts.
//     Indian plans are drawn in feet and inches and the engine works in
//     feet, so asking for metres would add two conversions an LLM can get
//     wrong.
//   - No socket, light or fan counts. Plans rarely show them, and the engine
//     fills them from IS 732-aligned room defaults (ROOM_DEFAULTS).
//   - No totals (area, room count, bathroom count). Code derives them from
//     the rooms, so they can never disagree with the room list.
//   - Appliances only when drawn or labelled. No AC tonnage: every heavy
//     appliance gets the same dedicated 4 mm² / 20 A circuit.
//
// FLOOR_PLAN_RESPONSE_SCHEMA goes to Gemini as responseSchema, so the API
// constrains the reply to this shape. floorPlanExtractionSchema checks it
// again on arrival: a schema-constrained reply is still untrusted input.
// ============================================================================

import { z } from "zod";

export const PLAN_ROOM_TYPES = [
  "MASTER_BEDROOM",
  "BEDROOM",
  "STUDY",
  "LIVING",
  "DINING",
  "KITCHEN",
  "BATHROOM",
  "BALCONY",
  "POOJA",
  "STORE",
  "SERVANT_ROOM",
  "PASSAGE",
  "STAIRCASE",
  "PARKING",
  "OTHER",
] as const;

export const PLAN_APPLIANCES = ["AC", "GEYSER", "COOKING_RANGE"] as const;

export const PLAN_UNITS = ["FT", "M"] as const;

export const floorPlanRoomSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(PLAN_ROOM_TYPES),
  floor: z.number().int().min(0).max(3),
  length: z.number().positive().max(300),
  width: z.number().positive().max(300),
  unit: z.enum(PLAN_UNITS),
  dimensionsLabelled: z.boolean(),
  attachedToBedroom: z.boolean(),
  appliances: z.array(z.enum(PLAN_APPLIANCES)).max(6),
});

export const floorPlanExtractionSchema = z.object({
  isFloorPlan: z.boolean(),
  appliancesMarked: z.boolean(),
  statedTotalSqFt: z.number().positive().max(50_000).nullable(),
  rooms: z.array(floorPlanRoomSchema).max(40),
  notes: z.array(z.string().max(200)).max(8),
});

export type FloorPlanRoom = z.infer<typeof floorPlanRoomSchema>;
export type FloorPlanExtraction = z.infer<typeof floorPlanExtractionSchema>;

const ROOM_FIELDS = [
  "name",
  "type",
  "floor",
  "length",
  "width",
  "unit",
  "dimensionsLabelled",
  "attachedToBedroom",
  "appliances",
];

const PLAN_FIELDS = ["isFloorPlan", "appliancesMarked", "statedTotalSqFt", "rooms", "notes"];

/** Gemini's OpenAPI-subset schema for the same shape (generationConfig.responseSchema). */
export const FLOOR_PLAN_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    isFloorPlan: { type: "BOOLEAN" },
    appliancesMarked: { type: "BOOLEAN" },
    statedTotalSqFt: { type: "NUMBER", nullable: true },
    rooms: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          type: { type: "STRING", enum: [...PLAN_ROOM_TYPES] },
          floor: { type: "INTEGER" },
          length: { type: "NUMBER" },
          width: { type: "NUMBER" },
          unit: { type: "STRING", enum: [...PLAN_UNITS] },
          dimensionsLabelled: { type: "BOOLEAN" },
          attachedToBedroom: { type: "BOOLEAN" },
          appliances: { type: "ARRAY", items: { type: "STRING", enum: [...PLAN_APPLIANCES] } },
        },
        required: ROOM_FIELDS,
        propertyOrdering: ROOM_FIELDS,
      },
    },
    notes: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: PLAN_FIELDS,
  propertyOrdering: PLAN_FIELDS,
};
