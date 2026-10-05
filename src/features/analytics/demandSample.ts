// src/features/analytics/demandSample.ts
// ============================================================================
// PROJECTED CABLE DEMAND BY GAUGE — SAMPLE
// ============================================================================
// What a cable manufacturer could read off Phasr: demand for each wire gauge,
// by pin code, from estimates made while houses are still being planned.
//
// The estimate MIX below is illustrative: no production data is used, and it
// says so wherever it is shown. Every coil count, though, is the engine's
// real output for that mix: each sample home goes through calculateBOM like
// any other estimate.
//
// Demand is counted in coils, the unit the trade buys, summed per estimate.
// A house buys whole coils, so the sum of each estimate's coils is the
// purchase volume; rounding the summed metres instead would understate it.
// ============================================================================

import { calculateBOM } from "../calculator/calculateBOM";
import { buildCalculatorInput } from "../calculator/generateRoomSpecs";
import type { LayoutInput } from "../calculator/layoutTypes";

export const DEMAND_GAUGES = ["1.5", "2.5", "4.0"] as const;
export type DemandGauge = (typeof DEMAND_GAUGES)[number];

export const GAUGE_INFO: Record<DemandGauge, { label: string; use: string }> = {
  "1.5": { label: "1.5 mm²", use: "Lighting circuits" },
  "2.5": { label: "2.5 mm²", use: "15 A socket circuits" },
  "4.0": { label: "4 mm²", use: "AC and geyser circuits" },
};

/** All three gauges are sold in 90 m coils (WIRE_GAUGES in constants.ts). */
export const DEMAND_COIL_METRES = 90;

type HomeKey = "flat1" | "flat2" | "flat3" | "floor3" | "duplex4";

/** The homes the sample is made of. Layouts the calculator form itself accepts. */
export const SAMPLE_HOMES: Record<HomeKey, { label: string; layout: Omit<LayoutInput, "city"> }> = {
  flat1: {
    label: "1BHK flat",
    layout: { propertyType: "FLAT", bedrooms: 1, bathrooms: 1, balconies: 1, totalFloors: 1, modularKitchen: false, acInBedrooms: true, acInLivingRoom: false, geyserInBathrooms: true },
  },
  flat2: {
    label: "2BHK flat",
    layout: { propertyType: "FLAT", bedrooms: 2, bathrooms: 2, balconies: 1, totalFloors: 1, modularKitchen: false, acInBedrooms: true, acInLivingRoom: true, geyserInBathrooms: true },
  },
  flat3: {
    label: "3BHK flat",
    layout: { propertyType: "FLAT", bedrooms: 3, bathrooms: 3, balconies: 2, totalFloors: 1, modularKitchen: true, acInBedrooms: true, acInLivingRoom: true, geyserInBathrooms: true },
  },
  floor3: {
    label: "3BHK builder floor",
    layout: { propertyType: "BUILDER_FLOOR", bedrooms: 3, bathrooms: 3, balconies: 1, totalFloors: 1, modularKitchen: true, acInBedrooms: true, acInLivingRoom: true, geyserInBathrooms: true },
  },
  duplex4: {
    label: "4BHK duplex",
    layout: { propertyType: "DUPLEX", bedrooms: 4, bathrooms: 4, balconies: 2, totalFloors: 2, modularKitchen: true, acInBedrooms: true, acInLivingRoom: true, geyserInBathrooms: true },
  },
};

/** One illustrative month of estimates per pin code. */
export const SAMPLE_MIX: Array<{ pin: string; area: string; city: string; homes: Array<[HomeKey, number]> }> = [
  { pin: "110020", area: "New Delhi", city: "Delhi", homes: [["floor3", 26], ["flat2", 12], ["duplex4", 8]] },
  { pin: "122002", area: "Gurugram", city: "Gurugram", homes: [["flat3", 34], ["duplex4", 14], ["flat2", 10]] },
  { pin: "201301", area: "Noida", city: "Noida", homes: [["flat2", 40], ["flat3", 22], ["flat1", 12]] },
];

export type GaugeVolume = { coils: number; metres: number };

export type PinDemand = {
  pin: string;
  area: string;
  estimates: number;
  homes: Array<{ label: string; count: number }>;
  byGauge: Record<DemandGauge, GaugeVolume>;
};

/** The coils and metres one home needs in each charted gauge, from the engine. */
export function homeDemand(layout: Omit<LayoutInput, "city">, city: string): Record<DemandGauge, GaugeVolume> {
  const bom = calculateBOM(buildCalculatorInput({ ...layout, city }));
  const out = {} as Record<DemandGauge, GaugeVolume>;
  for (const gauge of DEMAND_GAUGES) {
    const wire = bom.items.find((item) => item.category === "WIRE" && item.wireGauge === gauge);
    out[gauge] =
      wire && wire.category === "WIRE"
        ? { coils: wire.coilsRequired, metres: wire.totalMeters }
        : { coils: 0, metres: 0 };
  }
  return out;
}

function buildPinDemand(): PinDemand[] {
  return SAMPLE_MIX.map(({ pin, area, city, homes }) => {
    const byGauge = Object.fromEntries(
      DEMAND_GAUGES.map((g) => [g, { coils: 0, metres: 0 }])
    ) as Record<DemandGauge, GaugeVolume>;

    for (const [key, count] of homes) {
      const perHome = homeDemand(SAMPLE_HOMES[key].layout, city);
      for (const gauge of DEMAND_GAUGES) {
        byGauge[gauge].coils += perHome[gauge].coils * count;
        byGauge[gauge].metres += perHome[gauge].metres * count;
      }
    }

    return {
      pin,
      area,
      estimates: homes.reduce((sum, [, count]) => sum + count, 0),
      homes: homes.map(([key, count]) => ({ label: SAMPLE_HOMES[key].label, count })),
      byGauge,
    };
  });
}

/** The sample, computed once when the module loads. Pure: the same every time. */
export const PIN_DEMAND: PinDemand[] = buildPinDemand();
