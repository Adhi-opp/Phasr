// src/features/calculator/constants.ts
// ============================================================================
// IS 732:2019 COMPLIANT ELECTRICAL ESTIMATION CONSTANTS
// Bureau of Indian Standards — Code of Practice for Electrical Wiring Installations
// ============================================================================
// These constants encode the engineering rules that drive the BOM calculator.
// Prices are intentionally excluded — they come from the PriceIndex DB table.
// All wire sizes in sq mm. All lengths in meters. All currents in Amperes.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. WIRE GAUGE SPECIFICATIONS
//    Coil lengths vary by gauge — this is NOT universal.
//    Source: Polycab/Havells/Finolex standard packaging (Indian market)
// ---------------------------------------------------------------------------

export const WIRE_GAUGES = {
  "1.0": {
    sizeSqMm: 1.0,
    coilLengthMeters: 90,
    maxCurrentAmps: 10,
    resistanceOhmPerKm: 18.1, // approximate copper at 70°C
    use: "Call bells, signal wiring, low-load lighting",
  },
  "1.5": {
    sizeSqMm: 1.5,
    coilLengthMeters: 90,
    maxCurrentAmps: 15,
    resistanceOhmPerKm: 12.1,
    use: "Standard lighting circuits, ceiling fans, 5A sockets",
  },
  "2.5": {
    sizeSqMm: 2.5,
    coilLengthMeters: 90,
    maxCurrentAmps: 20,
    resistanceOhmPerKm: 7.41,
    use: "15A power sockets, small heaters, refrigerators, washing machines",
  },
  "4.0": {
    sizeSqMm: 4.0,
    coilLengthMeters: 90, // some brands sell 45m for thicker gauges
    maxCurrentAmps: 27,
    resistanceOhmPerKm: 4.61,
    use: "1.5T+ ACs, heavy geysers (3kW+), dedicated appliance circuits",
  },
  "6.0": {
    sizeSqMm: 6.0,
    coilLengthMeters: 45, // thicker gauges come in shorter coils
    maxCurrentAmps: 34,
    resistanceOhmPerKm: 3.08,
    use: "Main feeder (single-phase), sub-main to distribution board",
  },
  "10.0": {
    sizeSqMm: 10.0,
    coilLengthMeters: 45,
    maxCurrentAmps: 46,
    resistanceOhmPerKm: 1.83,
    use: "Main feeder (three-phase), heavy commercial loads",
  },
  "16.0": {
    sizeSqMm: 16.0,
    coilLengthMeters: 30,
    maxCurrentAmps: 61,
    resistanceOhmPerKm: 1.15,
    use: "Three-phase main incoming, large commercial",
  },
} as const;

export type WireGaugeKey = keyof typeof WIRE_GAUGES;

// ---------------------------------------------------------------------------
// 2. EARTH WIRE SPECIFICATIONS (IS 732 / IS 3043)
//    Minimum protective earth conductor: 2.5 sq mm
//    Color: Green/Yellow PVC insulation (mandatory)
// ---------------------------------------------------------------------------

export const EARTH_WIRE = {
  minSizeSqMm: 2.5,
  color: "Green/Yellow",
  // Earth wire size is derived from the phase conductor size:
  // Phase ≤ 16 sq mm → Earth = same size as phase
  // Phase > 16 sq mm → Earth = half of phase (min 16 sq mm)
  getSizeForPhase: (phaseSizeSqMm: number): number => {
    if (phaseSizeSqMm <= 16) return Math.max(2.5, phaseSizeSqMm);
    return Math.max(16, phaseSizeSqMm / 2);
  },
} as const;

// ---------------------------------------------------------------------------
// 3. CIRCUIT TYPES
//    Each circuit type defines which wire gauge to use and MCB rating.
//    IS 732 mandates separation of lighting and power sub-circuits.
// ---------------------------------------------------------------------------

export const CIRCUIT_TYPES = {
  LIGHTING: {
    wireGauge: "1.5" as WireGaugeKey,
    mcbRatingAmps: 6, // 6A MCB Type B for lighting
    mcbType: "B" as const,
    maxPointsPerCircuit: 10, // IS 732 recommends max 10 points per lighting circuit
    description: "Lights, fans, exhaust fans",
  },
  POWER_5A: {
    wireGauge: "1.5" as WireGaugeKey,
    mcbRatingAmps: 10, // 10A MCB for 5A socket circuits
    mcbType: "B" as const,
    maxPointsPerCircuit: 10,
    description: "5A sockets for phone chargers, lamps, small electronics",
  },
  POWER_15A: {
    wireGauge: "2.5" as WireGaugeKey,
    mcbRatingAmps: 16, // 16A MCB for 15A socket circuits
    mcbType: "C" as const,
    maxPointsPerCircuit: 2, // IS 732: max 2 power sockets per 15A circuit
    description: "15A sockets for refrigerator, washing machine, microwave",
  },
  HEAVY_APPLIANCE: {
    wireGauge: "4.0" as WireGaugeKey,
    mcbRatingAmps: 20, // 20A MCB for heavy loads
    mcbType: "C" as const,
    maxPointsPerCircuit: 1, // Dedicated circuit per heavy appliance
    description: "AC (1.5T+), geyser (3kW+), oven, heavy motor",
  },
  COOKING_RANGE: {
    wireGauge: "6.0" as WireGaugeKey,
    mcbRatingAmps: 32, // 32A MCB for cooking range / induction hob
    mcbType: "C" as const,
    maxPointsPerCircuit: 1,
    description: "Electric cooking range, induction hob (high wattage)",
  },
} as const;

export type CircuitTypeKey = keyof typeof CIRCUIT_TYPES;

// ---------------------------------------------------------------------------
// 4. MCB & SWITCHGEAR
// ---------------------------------------------------------------------------

export const MCB_RATINGS_AVAILABLE = [6, 10, 16, 20, 25, 32, 40, 63] as const;

export const RCCB_SPECS = {
  SINGLE_PHASE: { poles: 2, ratingAmps: 40, sensitivityMa: 30 },
  THREE_PHASE: { poles: 4, ratingAmps: 63, sensitivityMa: 30 },
} as const;

// Main switch / isolator at the distribution board
export const MAIN_SWITCH = {
  SINGLE_PHASE: { ratingAmps: 32, poles: 2 }, // DP (Double Pole)
  THREE_PHASE: { ratingAmps: 63, poles: 4 },  // FP (Four Pole)
} as const;

// ---------------------------------------------------------------------------
// 5. IS 732 DIVERSITY FACTORS
//    Diversity Factor = (Maximum Demand) / (Total Connected Load)
//    Applied to prevent over-engineering. NOT all appliances run at peak simultaneously.
//
//    These are based on IS 732 Table 3 guidelines for residential buildings.
//    The factor varies based on the NUMBER of similar circuits/points.
// ---------------------------------------------------------------------------

export const DIVERSITY_FACTORS = {
  // Lighting: based on number of lighting points
  lighting: (pointCount: number): number => {
    if (pointCount <= 10) return 0.90; // small house, most lights likely on
    if (pointCount <= 20) return 0.75;
    if (pointCount <= 30) return 0.66;
    if (pointCount <= 50) return 0.60;
    return 0.55; // large installations
  },

  // Power sockets (15A): based on number of socket outlets
  powerSockets: (socketCount: number): number => {
    if (socketCount <= 5) return 0.80;
    if (socketCount <= 10) return 0.60;
    if (socketCount <= 20) return 0.50;
    return 0.40;
  },

  // Heavy appliances (ACs, geysers): usage pattern based
  heavyAppliances: (applianceCount: number): number => {
    if (applianceCount <= 2) return 1.0;  // 1-2 ACs likely both running
    if (applianceCount <= 4) return 0.80;
    if (applianceCount <= 6) return 0.65;
    return 0.55;
  },

  // Cooking loads
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cooking: (count: number): number => {
    return 0.80; // 80% — not all burners at full simultaneously
  },
} as const;

// ---------------------------------------------------------------------------
// 6. CONDUIT SPECIFICATIONS
//    PVC conduit for concealed wiring (standard Indian construction)
//    IS 732 mandates max 40% fill factor for conduit
// ---------------------------------------------------------------------------

export const CONDUIT = {
  maxFillFactor: 0.40, // 40% of conduit cross-section area can be wire
  types: {
    "20mm": { outerDiameterMm: 20, innerDiameterMm: 17, maxWires1_5: 4, maxWires2_5: 3 },
    "25mm": { outerDiameterMm: 25, innerDiameterMm: 21, maxWires1_5: 6, maxWires2_5: 4, maxWires4_0: 3 },
    "32mm": { outerDiameterMm: 32, innerDiameterMm: 28, maxWires4_0: 4, maxWires6_0: 3 },
  },
  // Standard conduit used per circuit type
  forCircuit: {
    LIGHTING: "20mm" as const,
    POWER_5A: "20mm" as const,
    POWER_15A: "25mm" as const,
    HEAVY_APPLIANCE: "25mm" as const,
    COOKING_RANGE: "32mm" as const,
  },
} as const;

// ---------------------------------------------------------------------------
// 7. ROOM DEFAULT ELECTRICAL POINTS
//    Based on IS 732 residential guidelines + Indian construction practice.
//    These are DEFAULTS — user can override in the form.
//    Each room type has standard requirements that a competent electrician
//    would typically wire.
// ---------------------------------------------------------------------------

export interface RoomElectricalDefaults {
  lightPoints: number;
  fanPoints: number;
  socket5A: number;       // standard sockets (phone charger, lamp, etc.)
  socket15A: number;      // power sockets (fridge, washing machine, etc.)
  heavyAppliances: number; // dedicated circuits (AC, geyser)
  exhaustFan: number;
  description: string;
}

export const ROOM_DEFAULTS: Record<string, RoomElectricalDefaults> = {
  BEDROOM: {
    lightPoints: 2,
    fanPoints: 1,
    socket5A: 3,
    socket15A: 1,
    heavyAppliances: 1, // AC
    exhaustFan: 0,
    description: "Standard bedroom with AC provision",
  },
  BEDROOM_MASTER: {
    lightPoints: 3,
    fanPoints: 1,
    socket5A: 4,
    socket15A: 1,
    heavyAppliances: 1, // AC
    exhaustFan: 0,
    description: "Master bedroom with AC provision",
  },
  LIVING_ROOM: {
    lightPoints: 4,
    fanPoints: 2,
    socket5A: 4,
    socket15A: 2, // TV, set-top box, etc.
    heavyAppliances: 1, // AC
    exhaustFan: 0,
    description: "Living/drawing room with AC provision",
  },
  KITCHEN: {
    lightPoints: 2,
    fanPoints: 0,
    socket5A: 2,
    socket15A: 3, // fridge, microwave, mixer
    heavyAppliances: 0,
    exhaustFan: 1,
    description: "Kitchen with heavy appliance sockets",
  },
  KITCHEN_MODULAR: {
    lightPoints: 3,
    fanPoints: 0,
    socket5A: 3,
    socket15A: 4, // fridge, microwave, mixer, dishwasher
    heavyAppliances: 1, // chimney or electric hob
    exhaustFan: 1,
    description: "Modular kitchen with chimney/hob provision",
  },
  BATHROOM: {
    lightPoints: 1,
    fanPoints: 0,
    socket5A: 1, // shaver point
    socket15A: 0,
    heavyAppliances: 1, // geyser
    exhaustFan: 1,
    description: "Bathroom with geyser provision",
  },
  BATHROOM_COMMON: {
    lightPoints: 1,
    fanPoints: 0,
    socket5A: 0,
    socket15A: 0,
    heavyAppliances: 0, // no geyser in common/guest bathroom
    exhaustFan: 1,
    description: "Common/guest bathroom without geyser",
  },
  DINING: {
    lightPoints: 2,
    fanPoints: 1,
    socket5A: 2,
    socket15A: 0,
    heavyAppliances: 0,
    exhaustFan: 0,
    description: "Dining area",
  },
  BALCONY: {
    lightPoints: 1,
    fanPoints: 0,
    socket5A: 1,
    socket15A: 0,
    heavyAppliances: 0,
    exhaustFan: 0,
    description: "Balcony with light and socket",
  },
  POOJA_ROOM: {
    lightPoints: 2,
    fanPoints: 0,
    socket5A: 1,
    socket15A: 0,
    heavyAppliances: 0,
    exhaustFan: 0,
    description: "Pooja/prayer room",
  },
  STORE_ROOM: {
    lightPoints: 1,
    fanPoints: 0,
    socket5A: 1,
    socket15A: 0,
    heavyAppliances: 0,
    exhaustFan: 0,
    description: "Store/utility room",
  },
  SERVANT_ROOM: {
    lightPoints: 1,
    fanPoints: 1,
    socket5A: 2,
    socket15A: 0,
    heavyAppliances: 0,
    exhaustFan: 0,
    description: "Servant quarter",
  },
  PASSAGE: {
    lightPoints: 1,
    fanPoints: 0,
    socket5A: 1,
    socket15A: 0,
    heavyAppliances: 0,
    exhaustFan: 0,
    description: "Corridor/passage",
  },
  STAIRCASE: {
    lightPoints: 2, // top and bottom
    fanPoints: 0,
    socket5A: 0,
    socket15A: 0,
    heavyAppliances: 0,
    exhaustFan: 0,
    description: "Staircase with two-way switching",
  },
  PARKING: {
    lightPoints: 2,
    fanPoints: 0,
    socket5A: 1,
    socket15A: 1, // for potential EV charger or power tool
    heavyAppliances: 0,
    exhaustFan: 0,
    description: "Covered parking area",
  },
  COMMERCIAL_OFFICE: {
    lightPoints: 6,
    fanPoints: 2,
    socket5A: 6,
    socket15A: 3,
    heavyAppliances: 2, // ACs
    exhaustFan: 0,
    description: "Small office space (200-300 sq ft)",
  },
  COMMERCIAL_SHOP: {
    lightPoints: 4,
    fanPoints: 1,
    socket5A: 4,
    socket15A: 2,
    heavyAppliances: 1, // AC
    exhaustFan: 0,
    description: "Retail shop",
  },
};

export type RoomTypeKey = keyof typeof ROOM_DEFAULTS;

// ---------------------------------------------------------------------------
// 8. WIRING RUN LENGTH ESTIMATION
//    Wire is not just the room perimeter — it runs from the DB (distribution
//    board) through conduit in walls/ceiling to each point.
//    These are empirical multipliers based on Indian residential construction.
//
//    Formula: wireLength = (roomPerimeterMeters × multiplier) + dbDistanceMeters
//    Per circuit, not per point. Each circuit serves multiple points.
//
//    The DB is typically near the main entrance. Average distance to rooms:
// ---------------------------------------------------------------------------

export const WIRING_ESTIMATION = {
  // Multiplier on room perimeter to estimate total wire run per circuit in room
  // Accounts for: wall drops, ceiling runs, bends, junction boxes
  perimeterMultiplier: 1.3,

  // Average distance from Distribution Board to each room (in meters)
  // User can override, but these are reasonable defaults for Indian flats
  defaultDbDistanceByFloor: {
    sameFloor: 5,       // DB on same floor, average distance
    oneFloorAway: 8,    // DB one floor above/below
    twoFloorsAway: 14,  // DB two floors away
  },

  // Each wire point (socket/light) needs approximately this many meters
  // of wire for the final drop from the conduit junction to the point
  perPointDropMeters: 1.5,

  // Every circuit needs 3 conductors minimum: Phase (Red/Brown), Neutral (Black/Blue), Earth (Green-Yellow)
  conductorsPerCircuit: 3,

  // For heavy appliance dedicated circuits, wire runs directly from DB
  // Average run length for a dedicated circuit in a typical Indian flat
  dedicatedCircuitAvgMeters: 12,
} as const;

// ---------------------------------------------------------------------------
// 9. SAFETY & BUFFER
//    IS 732 mandates sufficient cable for connections, loops, and wastage.
//    Real-world: electricians always need 10-15% extra for bends, cuts, mistakes.
// ---------------------------------------------------------------------------

export const SAFETY_MARGIN_MULTIPLIER = 1.10; // 10% safety buffer on all wire lengths

// Wastage factor for conduit (conduit has bends, couplings, dead ends)
export const CONDUIT_WASTAGE_MULTIPLIER = 1.15; // 15% extra for conduit

// ---------------------------------------------------------------------------
// 10. VOLTAGE DROP CONSTRAINTS (IS 732 Section 8)
//     Maximum permissible voltage drop from origin to any point:
//     - Lighting circuits: 3% of nominal voltage (6.9V on 230V)
//     - Power circuits: 5% of nominal voltage (11.5V on 230V)
//     If exceeded, must upgrade to next wire gauge.
// ---------------------------------------------------------------------------

export const VOLTAGE_DROP = {
  nominalVoltage: 230,         // Single-phase Indian standard
  maxDropLightingPercent: 3,   // 3% = 6.9V
  maxDropPowerPercent: 5,      // 5% = 11.5V
  // Voltage drop formula: Vd = (2 × I × R × L) / 1000
  // I = current (A), R = resistance (Ω/km), L = length (m)
  // Factor of 2 because current flows through phase AND returns via neutral
} as const;

// ---------------------------------------------------------------------------
// 11. DISTRIBUTION BOARD SIZING
//     Number of ways = total MCB slots needed + spare slots (20% min)
// ---------------------------------------------------------------------------

export const DB_SIZING = {
  standardWays: [4, 6, 8, 12, 16, 20, 24] as readonly number[],
  spareWayPercent: 0.20, // Keep 20% spare ways for future expansion
  // DB also needs: 1 main switch + 1 RCCB (minimum)
  fixedSlots: 2, // main switch + RCCB occupy these

  getRequiredWays: (mcbCount: number): number => {
    const totalNeeded = mcbCount + DB_SIZING.fixedSlots;
    const withSpares = Math.ceil(totalNeeded * (1 + DB_SIZING.spareWayPercent));
    // Find the smallest standard DB that fits
    const suitable = DB_SIZING.standardWays.find((w) => w >= withSpares);
    return suitable ?? DB_SIZING.standardWays[DB_SIZING.standardWays.length - 1];
  },
} as const;

// ---------------------------------------------------------------------------
// 12. MODULAR SWITCH PLATE SIZING
//     Indian modular plates come in standard module counts.
//     Each electrical point occupies a certain number of modules.
// ---------------------------------------------------------------------------

export const MODULAR_PLATES = {
  modulesPerPoint: {
    lightSwitch: 1,   // 1 module per switch
    fanRegulator: 2,  // 2 modules (electronic/step regulator)
    socket5A: 2,      // 2 modules (5A socket + switch)
    socket15A: 3,     // 3 modules (15A socket + switch)
    bellPush: 1,      // 1 module
    blankPlate: 1,    // 1 module (cover for future use)
  },
  standardPlateSizes: [1, 2, 3, 4, 6, 8, 12, 16, 18] as readonly number[],
} as const;

// ---------------------------------------------------------------------------
// 13. APPLIANCE LOAD REFERENCE (Watts)
//     Used to calculate total connected load and maximum demand.
//     These are typical rated wattages for Indian residential appliances.
// ---------------------------------------------------------------------------

export const APPLIANCE_LOADS_WATTS = {
  // Lighting
  ledBulb: 10,
  tubeLight: 20,
  cflBulb: 15,
  decorativeLight: 40,

  // Fans
  ceilingFan: 75,
  exhaustFan: 40,
  tableFan: 50,

  // Light appliances (5A socket)
  phoneCharger: 10,
  laptop: 65,
  tv32inch: 50,
  tv55inch: 120,
  wifi_router: 15,
  ironBox: 1000,

  // Medium appliances (15A socket)
  refrigerator: 200,
  washingMachine: 500,
  microwave: 1200,
  mixer: 750,
  vacuumCleaner: 1400,
  dishwasher: 1800,

  // Heavy appliances (dedicated circuit)
  acWindow1T: 1200,
  acSplit1_5T: 1800,
  acSplit2T: 2400,
  geyserInstant: 3000,
  geyserStorage15L: 2000,
  geyserStorage25L: 2500,
  electricHob: 2000,
  cookingRange: 3500,
  evCharger7kw: 7000,

  // Motor loads (for staircase pumps etc.)
  waterPump0_5hp: 375,
  waterPump1hp: 750,
} as const;

// ---------------------------------------------------------------------------
// 14. LOAD CALCULATION HELPERS
//     Convert between units commonly used in Indian electrical work.
// ---------------------------------------------------------------------------

export const ELECTRICAL_CONSTANTS = {
  WATTS_PER_KW: 1000,
  POWER_FACTOR: 0.85, // typical residential power factor (lagging)
  // For single phase: I = P / (V × PF)
  // For three phase: I = P / (√3 × V × PF)
  SQRT_3: 1.732,
  // Three-phase threshold: IS 732 recommends 3-phase for loads > 5kW
  THREE_PHASE_THRESHOLD_KW: 5,
} as const;

// ---------------------------------------------------------------------------
// 15. BOQ DISCLAIMER
//     One string for the engine's result and the results page footer, so a
//     saved estimate shows the current wording rather than the one stored
//     with it. VoltFlow cannot be the certifying party: installations must be
//     executed and certified by a licensed contractor under CEA regulations.
// ---------------------------------------------------------------------------

export const BOQ_DISCLAIMER =
  "DISCLAIMER: Indicative BOQ for procurement only. Final circuit design, " +
  "protection coordination, and installation must be verified by a licensed " +
  "electrical contractor per IS 732 / NEC regulations.";
