// src/features/calculator/layoutTypes.ts
// ============================================================================
// HOMEOWNER-FRIENDLY INPUT TYPES FOR THE LAYOUT BRIDGE
// ============================================================================
// These types represent what a non-technical homeowner enters in the UI.
// No electrical knowledge required — no wire gauges, MCB ratings, or circuit
// details. The generateRoomSpecsFromLayout() bridge function translates these
// into RoomSpec[] for the calculateBOM() engine.
// ============================================================================

/**
 * Simplified property input from a homeowner.
 * This is the ONLY interface the UI form needs to collect.
 *
 * Architecture:
 *   LayoutInput → generateRoomSpecsFromLayout() → RoomSpec[] → calculateBOM() → BOMResult
 */
export interface LayoutInput {
  // --- Property basics ---
  propertyType: "FLAT" | "BUILDER_FLOOR" | "DUPLEX";
  city?: string;              // defaults to "NCR" for estimation assumptions
  pincode?: string;           // the site's; required to save, and must be in the city's state
  bedrooms: number;           // 1–5
  bathrooms: number;          // 1–4
  balconies: number;          // 0–3
  totalFloors: number;        // 1 for flat/builder floor, 2 for duplex
  approxSqFt?: number;        // optional — used for display, NOT for BOM calculation

  // --- Homeowner toggles ---
  modularKitchen: boolean;    // standard gas kitchen vs modular (chimney/hob provision)
  acInBedrooms: boolean;      // AC provision in all bedrooms
  acInLivingRoom: boolean;    // AC provision in living room
  geyserInBathrooms: boolean; // geyser provision (attached baths get geyser, guest bath does not)
}
