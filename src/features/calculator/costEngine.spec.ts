import assert from "node:assert/strict";
import {
  applyPricing,
  PricingDataError,
  RATE_CARD,
  TRADE_DISCOUNT,
  type EnrichedBOMResult,
} from "./costEngine";
import type { BOMItem, BOMResult, CircuitDefinition, PricingCode } from "./type";

function makeCircuit(partial: Partial<CircuitDefinition>): CircuitDefinition {
  return {
    circuitId: partial.circuitId ?? "C-1",
    circuitType: partial.circuitType ?? "LIGHTING",
    roomId: partial.roomId ?? "room-1",
    roomName: partial.roomName ?? "Room 1",
    floor: partial.floor ?? 0,
    wireGauge: partial.wireGauge ?? "1.5",
    mcbRatingAmps: partial.mcbRatingAmps ?? 10,
    pointCount: partial.pointCount ?? 1,
    pointDescription: partial.pointDescription ?? "test",
    wireLengthMeters: partial.wireLengthMeters ?? 10,
    conduitLengthMeters: partial.conduitLengthMeters ?? 8,
  };
}

function makeResult(
  items: BOMItem[],
  circuits: CircuitDefinition[] = [],
  totalConnectedLoadKw = 5,
  maxDemandKw = 3
): BOMResult {
  return {
    generatedAt: new Date().toISOString(),
    algorithmVersion: "test",
    disclaimer: "test",
    totalConnectedLoadKw,
    maxDemandKw,
    recommendedPhase: "SINGLE",
    phaseDecision: {
      engineeringRecommendation: "SINGLE",
      regulatoryRecommendation: "SINGLE",
      finalRecommendation: "SINGLE",
      connectedLoadThresholdKw: 7,
      regulatoryPolicyKey: "DEFAULT",
      reasons: [],
    },
    totalCircuits: circuits.length,
    circuits,
    loadBreakdown: [],
    items,
    estimatedTotalCost: null,
    costBreakdown: {
      wires: null,
      switchgear: null,
      conduit: null,
      distributionBoard: null,
      mcbsAndProtection: null,
    },
    warnings: [],
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

run("pricing uses pricingCode with correct basis and quantity fields", () => {
  const items: BOMItem[] = [
    {
      category: "WIRE",
      pricingCode: "WIRE_1_5",
      wireGauge: "1.5",
      sizeSqMm: 1.5,
      description: "label mutation should not matter",
      totalMeters: 100,
      purchasableMeters: 180,
      surplusMeters: 80,
      coilsRequired: 2,
      coilLengthMeters: 90,
    },
    {
      category: "MCB",
      pricingCode: "MCB_10A_B",
      ratingAmps: 10,
      type: "B",
      quantity: 3,
      description: "custom text",
    },
    {
      category: "DB",
      pricingCode: "DB_GENERIC",
      ways: 12,
      quantity: 1,
      description: "another custom text",
    },
  ];

  const priced = applyPricing(makeResult(items));
  assert.equal(priced.pricing.materialCost, 100 * 26 + 3 * 350 + 3200);
  assert.equal(priced.pricing.surplusMetersTotal, 80);
  assert.equal(priced.pricing.surplusValueTotal, 80 * 26);
});

run("pricing is materials only: circuits, points and floors add no labour", () => {
  const circuits: CircuitDefinition[] = [
    makeCircuit({ circuitId: "LT-1", circuitType: "LIGHTING", pointCount: 8, floor: 0 }),
    makeCircuit({ circuitId: "LT-2", circuitType: "LIGHTING", pointCount: 4, floor: 1 }),
    makeCircuit({
      circuitId: "PW-1",
      circuitType: "POWER_15A",
      pointCount: 3,
      wireGauge: "2.5",
      mcbRatingAmps: 16,
      floor: 0,
    }),
    makeCircuit({
      circuitId: "HV-1",
      circuitType: "HEAVY_APPLIANCE",
      pointCount: 1,
      wireGauge: "4.0",
      mcbRatingAmps: 20,
      floor: 1,
    }),
    makeCircuit({
      circuitId: "CK-1",
      circuitType: "COOKING_RANGE",
      pointCount: 1,
      wireGauge: "6.0",
      mcbRatingAmps: 32,
      floor: 1,
    }),
  ];
  const items: BOMItem[] = [
    {
      category: "CONDUIT",
      pricingCode: "CONDUIT_20",
      sizeMm: "20mm",
      totalMeters: 100,
      description: "20mm PVC Conduit Pipe",
    },
  ];

  // Five circuits over two floors, 17 points: under the old labour model
  // this job carried ₹10,040 of labour. The price must be the conduit alone.
  const priced = applyPricing(makeResult(items, circuits, 25, 2));
  assert.equal(priced.pricing.materialCost, 100 * 35);

  for (const key of ["laborCost", "laborBreakdown", "totalEstimate", "lowEstimate", "highEstimate"]) {
    assert.ok(!(key in priced.pricing), `pricing still carries ${key}`);
  }
});

run("missing rate entry throws PricingDataError with missing code list", () => {
  const original = RATE_CARD.MCB_10A_B;
  delete (RATE_CARD as Partial<Record<PricingCode, { rate: number }>>).MCB_10A_B;

  try {
    applyPricing(
      makeResult([
        {
          category: "MCB",
          pricingCode: "MCB_10A_B",
          ratingAmps: 10,
          type: "B",
          quantity: 1,
          description: "10A MCB",
        },
      ])
    );
    assert.fail("Expected PricingDataError");
  } catch (error) {
    assert.ok(error instanceof PricingDataError);
    assert.deepEqual(error.missingCodes, ["MCB_10A_B"]);
    assert.equal(error.code, "PRICING_DATA_MISSING");
  } finally {
    (RATE_CARD as Record<PricingCode, unknown>).MCB_10A_B = original;
  }
});

run("rate <= 0 is treated as missing pricing data", () => {
  const original = RATE_CARD.CONDUIT_20;
  RATE_CARD.CONDUIT_20 = { ...RATE_CARD.CONDUIT_20, rate: 0 };

  try {
    applyPricing(
      makeResult([
        {
          category: "CONDUIT",
          pricingCode: "CONDUIT_20",
          sizeMm: "20mm",
          totalMeters: 10,
          description: "20mm PVC",
        },
      ])
    );
    assert.fail("Expected PricingDataError");
  } catch (error) {
    assert.ok(error instanceof PricingDataError);
    assert.deepEqual(error.missingCodes, ["CONDUIT_20"]);
  } finally {
    RATE_CARD.CONDUIT_20 = original;
  }
});

run("applyPricing accepts custom rate card override", () => {
  const items: BOMItem[] = [
    {
      category: "WIRE",
      pricingCode: "WIRE_1_5",
      wireGauge: "1.5",
      sizeSqMm: 1.5,
      description: "1.5 wire",
      totalMeters: 100,
      purchasableMeters: 180,
      surplusMeters: 80,
      coilsRequired: 2,
      coilLengthMeters: 90,
    },
  ];

  // Custom rate card with doubled wire price
  const customRateCard = { ...RATE_CARD };
  customRateCard.WIRE_1_5 = { rate: 52, basis: "per_meter" as const, source: "FINAL" as const };

  const pricedDefault = applyPricing(makeResult(items));
  const pricedCustom = applyPricing(makeResult(items), customRateCard);

  // Default: 100m × 26 = 2600, Custom: 100m × 52 = 5200
  assert.equal(pricedDefault.pricing.materialCost, 100 * 26);
  assert.equal(pricedCustom.pricing.materialCost, 100 * 52);
});

run("deterministic totals are additive", () => {
  const items: BOMItem[] = [
    {
      category: "WIRE",
      pricingCode: "WIRE_2_5",
      wireGauge: "2.5",
      sizeSqMm: 2.5,
      description: "2.5 wire",
      totalMeters: 50,
      purchasableMeters: 90,
      surplusMeters: 40,
      coilsRequired: 1,
      coilLengthMeters: 90,
    },
    {
      category: "SWITCHGEAR",
      pricingCode: "SOCKET_5A_2M",
      itemType: "SOCKET_5A",
      quantity: 4,
      description: "5A socket",
    },
  ];

  const priced: EnrichedBOMResult = applyPricing(makeResult(items));
  assert.equal(priced.pricing.materialCost, 50 * 41 + 4 * 180);
});

run("cable spend is separated from the rest, and zero when there is none", () => {
  const wire: BOMItem = {
    category: "WIRE",
    pricingCode: "WIRE_2_5",
    wireGauge: "2.5",
    sizeSqMm: 2.5,
    description: "2.5 wire",
    totalMeters: 50,
    purchasableMeters: 90,
    surplusMeters: 40,
    coilsRequired: 1,
    coilLengthMeters: 90,
  };
  const socket: BOMItem = {
    category: "SWITCHGEAR",
    pricingCode: "SOCKET_5A_2M",
    itemType: "SOCKET_5A",
    quantity: 4,
    description: "5A socket",
  };

  assert.equal(applyPricing(makeResult([wire, socket])).pricing.cableCost, 50 * 41);
  assert.equal(applyPricing(makeResult([socket])).pricing.cableCost, 0);
});

// ---------------------------------------------------------------------------
// Market audit fields
// ---------------------------------------------------------------------------

/** One line in each spend category, with round numbers. */
function mixedItems(): BOMItem[] {
  return [
    {
      category: "WIRE",
      pricingCode: "WIRE_1_5",
      wireGauge: "1.5",
      sizeSqMm: 1.5,
      description: "1.5 wire (Lighting)",
      totalMeters: 100, // 100 × 26 = 2600
      purchasableMeters: 180,
      surplusMeters: 80,
      coilsRequired: 2,
      coilLengthMeters: 90,
    },
    {
      category: "MCB",
      pricingCode: "MCB_10A_B",
      ratingAmps: 10,
      type: "B",
      quantity: 2, // 2 × 350 = 700
      description: "10A MCB",
    },
    {
      category: "RCCB",
      pricingCode: "RCCB_40A_2P_30MA",
      ratingAmps: 40,
      poles: 2,
      sensitivityMa: 30,
      quantity: 1, // 1800
      description: "40A RCCB",
    },
    {
      category: "CONDUIT",
      pricingCode: "CONDUIT_20",
      sizeMm: "20mm",
      totalMeters: 40, // 40 × 35 = 1400
      description: "20mm PVC",
    },
    {
      category: "SWITCHGEAR",
      pricingCode: "SWITCH_MODULAR_6A_10A",
      itemType: "SWITCH",
      quantity: 5, // 5 × 120 = 600
      description: "Modular switch",
    },
  ];
}

run("spend split puts every line in one category and sums to materialCost", () => {
  const p = applyPricing(makeResult(mixedItems())).pricing;

  assert.equal(p.cableCost, 2600);
  assert.equal(p.protectionCost, 700 + 1800);
  assert.equal(p.conduitCost, 1400);
  assert.equal(p.accessoriesCost, 600);
  assert.equal(
    p.cableCost + p.protectionCost + p.conduitCost + p.accessoriesCost,
    p.materialCost
  );
});

run("wholesaleTradeEstimate is the trade material cost", () => {
  const p = applyPricing(makeResult(mixedItems())).pricing;
  assert.equal(p.wholesaleTradeEstimate, p.materialCost);
});

run("MRP grosses each category up by its own trade discount", () => {
  // Rate card is trade, so MRP = trade / (1 − discount) — never trade × (1 + d),
  // and never a second discount off the rate card.
  const p = applyPricing(makeResult(mixedItems())).pricing;
  const expected =
    2600 / (1 - TRADE_DISCOUNT.cable) +
    (2500 + 1400 + 600) / (1 - TRADE_DISCOUNT.other);

  assert.equal(p.totalMrp, Math.round(expected));
  assert.ok(p.totalMrp > p.wholesaleTradeEstimate);
});

run("a cable-heavier job has a larger retail gap than a switchgear-heavy one", () => {
  // Cable carries the deeper discount, so the gap must track the mix rather
  // than being a flat percentage on the total.
  const cableOnly = applyPricing(makeResult([mixedItems()[0]])).pricing;
  const switchOnly = applyPricing(makeResult([mixedItems()[4]])).pricing;

  const gap = (x: typeof cableOnly) => 1 - x.wholesaleTradeEstimate / x.totalMrp;
  assert.ok(Math.abs(gap(cableOnly) - TRADE_DISCOUNT.cable) < 0.001);
  assert.ok(Math.abs(gap(switchOnly) - TRADE_DISCOUNT.other) < 0.001);
  assert.ok(gap(cableOnly) > gap(switchOnly));
});

run("cable rate and discount together land on the printed MRP of a real coil", () => {
  // Polycab Etira FR, 90 m, Sep 2026. Changing either the rate or the
  // discount alone moves the derived MRP off the price printed on the coil;
  // re-check against a current MRP when this fails.
  const PRINTED_MRP_90M: [PricingCode, number][] = [
    ["WIRE_1_5", 3690],
    ["WIRE_2_5", 5890],
  ];
  for (const [code, printed] of PRINTED_MRP_90M) {
    const derived = (RATE_CARD[code].rate * 90) / (1 - TRADE_DISCOUNT.cable);
    assert.ok(
      Math.abs(derived - printed) / printed < 0.02,
      `${code}: derived MRP ₹${derived.toFixed(0)} vs printed ₹${printed}`
    );
  }
});
