import assert from "node:assert/strict";
import { auditQuote, fairCeiling, MARKUP_ALERT_THRESHOLD, spendSplit } from "./marketAudit";
import { applyPricing } from "./costEngine";
import { calculateBOM } from "./calculateBOM";
import { buildCalculatorInput } from "./generateRoomSpecs";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

const TRADE = 100_000;
const MRP = 160_000;

run("markup is measured against the reference price, not MRP", () => {
  const audit = auditQuote(123_000, TRADE, MRP);
  assert.ok(audit);
  assert.ok(Math.abs(audit.markupPct - 0.23) < 1e-9);
});

run("the fair ceiling is the reference plus the threshold, in whole rupees", () => {
  // 100,000 × 1.15 is 114,999.99999999999 in floating point.
  assert.equal(MARKUP_ALERT_THRESHOLD, 0.15);
  assert.equal(fairCeiling(TRADE), 115_000);
});

run("up to the fair ceiling is FAIR; a rupee past it is HIGH", () => {
  const ceiling = fairCeiling(TRADE);
  assert.equal(auditQuote(ceiling, TRADE, MRP)?.verdict, "FAIR");
  assert.equal(auditQuote(ceiling + 1, TRADE, MRP)?.verdict, "HIGH");
});

run("typing the ceiling the pane shows is FAIR even when it was rounded", () => {
  // 83,251 × 1.15 = 95,738.65; the pane shows ₹95,739. Measured by markup
  // percentage alone, that figure is a hair over 15% and would read HIGH.
  const reference = 83_251;
  const shown = fairCeiling(reference);
  assert.equal(shown, 95_739);
  assert.equal(auditQuote(shown, reference, 130_000)?.verdict, "FAIR");
  assert.equal(auditQuote(shown + 1, reference, 130_000)?.verdict, "HIGH");
});

run("aboveCeiling is the rupees over the ceiling, and zero at or under it", () => {
  assert.equal(auditQuote(130_000, TRADE, MRP)?.aboveCeiling, 15_000);
  assert.equal(auditQuote(MRP, TRADE, MRP)?.aboveCeiling, 45_000);
  assert.equal(auditQuote(fairCeiling(TRADE), TRADE, MRP)?.aboveCeiling, 0);
  assert.equal(auditQuote(90_000, TRADE, MRP)?.aboveCeiling, 0);
  // A few paise over is still over: never "₹0 above the fair ceiling".
  assert.equal(auditQuote(fairCeiling(TRADE) + 0.4, TRADE, MRP)?.aboveCeiling, 1);
});

run("a quote at or above MRP is ABOVE_RETAIL, not merely HIGH", () => {
  assert.equal(auditQuote(MRP, TRADE, MRP)?.verdict, "ABOVE_RETAIL");
  assert.equal(auditQuote(MRP * 1.1, TRADE, MRP)?.verdict, "ABOVE_RETAIL");
});

run("a quote under the reference is BELOW_REFERENCE with a negative markup", () => {
  const audit = auditQuote(90_000, TRADE, MRP);
  assert.equal(audit?.verdict, "BELOW_REFERENCE");
  assert.ok(audit && audit.markupPct < 0);
});

run("empty, zero, negative and non-finite input produce no verdict", () => {
  for (const bad of [0, -500, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(auditQuote(bad, TRADE, MRP), null, `input ${bad}`);
  }
  assert.equal(auditQuote(50_000, 0, MRP), null, "no reference price to compare against");
});

run("spend split on a real 2BHK covers all four categories and sums to 1", () => {
  const priced = applyPricing(
    calculateBOM(
      buildCalculatorInput({
        propertyType: "FLAT",
        city: "NCR",
        bedrooms: 2,
        bathrooms: 2,
        balconies: 1,
        totalFloors: 1,
        approxSqFt: 1050,
        modularKitchen: true,
        acInBedrooms: true,
        acInLivingRoom: false,
        geyserInBathrooms: true,
      })
    )
  );

  const slices = spendSplit(priced.pricing);
  assert.deepEqual(
    slices.map((s) => s.key),
    ["cable", "protection", "conduit", "accessories"]
  );
  const shareSum = slices.reduce((sum, s) => sum + s.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-9, `shares sum to ${shareSum}`);
  assert.ok(slices.every((s) => s.amount > 0), "a real job spends in every category");
});
