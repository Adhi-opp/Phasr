// src/features/calculator/presets.ts
// ============================================================================
// QUICK-START PRESETS
// ============================================================================
// The three homes on the calculator's first screen. Data only, no React, so
// presets.spec.ts can hold each card's phase badge to the engine: the badge
// is the first thing a visitor reads, and it once said "Single" for two
// homes the engine makes three-phase.
// ============================================================================

import type { LayoutInput } from "./layoutTypes";

export interface Preset {
  id: "2BHK" | "3BHK" | "DUPLEX";
  label: string;
  subtitle: string;
  specs: string[];
  /** The supply calculateBOM recommends for `layout`. presets.spec.ts fails if they disagree. */
  phase: "Single" | "Three";
  layout: LayoutInput;
}

export const PRESETS: Preset[] = [
  {
    id: "2BHK",
    label: "2 BHK Flat",
    subtitle: "Standard NCR flat",
    specs: ["2 bed · 2 bath · 1 balcony", "~900 sq ft"],
    phase: "Three",
    layout: {
      propertyType: "FLAT",
      city: "Delhi",
      bedrooms: 2,
      bathrooms: 2,
      balconies: 1,
      totalFloors: 1,
      approxSqFt: 900,
      modularKitchen: false,
      acInBedrooms: true,
      acInLivingRoom: true,
      geyserInBathrooms: true,
    },
  },
  {
    id: "3BHK",
    label: "3 BHK Flat",
    subtitle: "Mid-range NCR flat",
    specs: ["3 bed · 2 bath · 2 balconies", "~1200 sq ft · Modular kitchen"],
    phase: "Three",
    layout: {
      propertyType: "FLAT",
      city: "Delhi",
      bedrooms: 3,
      bathrooms: 2,
      balconies: 2,
      totalFloors: 1,
      approxSqFt: 1200,
      modularKitchen: true,
      acInBedrooms: true,
      acInLivingRoom: true,
      geyserInBathrooms: true,
    },
  },
  {
    id: "DUPLEX",
    label: "3 BHK Duplex",
    subtitle: "Independent duplex",
    specs: ["3 bed · 3 bath · 2 floors", "~1800 sq ft · Modular kitchen"],
    phase: "Three",
    layout: {
      propertyType: "DUPLEX",
      city: "Delhi",
      bedrooms: 3,
      bathrooms: 3,
      balconies: 1,
      totalFloors: 2,
      approxSqFt: 1800,
      modularKitchen: true,
      acInBedrooms: true,
      acInLivingRoom: true,
      geyserInBathrooms: true,
    },
  },
];
