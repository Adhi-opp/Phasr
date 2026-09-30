import assert from "node:assert/strict";
import { priceSnapshotInputSchema } from "./priceSnapshot";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

run("a ₹/kg MCX reading is accepted", () => {
  assert.ok(priceSnapshotInputSchema.safeParse({ baseCopperRate: 1420.5, source: "MCX" }).success);
});

run("an LME $/tonne figure entered as-is is refused, with a hint", () => {
  const r = priceSnapshotInputSchema.safeParse({ baseCopperRate: 14_600, source: "LME" });
  assert.equal(r.success, false);
  assert.match(r.error?.issues[0]?.message ?? "", /\$\/tonne/);
});

run("zero, negative and non-numeric rates are refused", () => {
  for (const baseCopperRate of [0, -1400, Number.NaN, "1400"]) {
    assert.equal(
      priceSnapshotInputSchema.safeParse({ baseCopperRate, source: "MCX" }).success,
      false,
      String(baseCopperRate)
    );
  }
});

run("only known sources, and no extra keys such as a backdated effectiveDate", () => {
  assert.equal(priceSnapshotInputSchema.safeParse({ baseCopperRate: 1400, source: "NYMEX" }).success, false);
  assert.equal(
    priceSnapshotInputSchema.safeParse({
      baseCopperRate: 1400,
      source: "MCX",
      effectiveDate: "2020-01-01",
    }).success,
    false
  );
});
