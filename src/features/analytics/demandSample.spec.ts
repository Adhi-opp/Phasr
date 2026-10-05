import assert from "node:assert/strict";
import { calculateBOM } from "../calculator/calculateBOM";
import { WIRE_GAUGES } from "../calculator/constants";
import { buildCalculatorInput } from "../calculator/generateRoomSpecs";
import { layoutSchema } from "../calculator/schemas";
import {
  DEMAND_COIL_METRES,
  DEMAND_GAUGES,
  PIN_DEMAND,
  SAMPLE_HOMES,
  SAMPLE_MIX,
  homeDemand,
} from "./demandSample";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

run("every sample home is a layout the calculator form accepts", () => {
  for (const { layout } of Object.values(SAMPLE_HOMES)) {
    assert.equal(layoutSchema.safeParse({ ...layout, city: "Delhi" }).success, true);
  }
});

run("the charted gauges are all sold in 90 m coils", () => {
  for (const gauge of DEMAND_GAUGES) {
    assert.equal(WIRE_GAUGES[gauge].coilLengthMeters, DEMAND_COIL_METRES);
  }
});

run("a home's demand is exactly the engine's coil count for it", () => {
  const { layout } = SAMPLE_HOMES.flat2;
  const bom = calculateBOM(buildCalculatorInput({ ...layout, city: "Noida" }));
  const perHome = homeDemand(layout, "Noida");
  for (const gauge of DEMAND_GAUGES) {
    const wire = bom.items.find((i) => i.category === "WIRE" && i.wireGauge === gauge);
    assert.ok(wire && wire.category === "WIRE");
    assert.equal(perHome[gauge].coils, wire.coilsRequired);
    assert.ok(perHome[gauge].coils > 0);
  }
});

run("pin demand is the sum of each estimate's whole coils", () => {
  for (const [i, { city, homes }] of SAMPLE_MIX.entries()) {
    const pin = PIN_DEMAND[i];
    assert.equal(pin.estimates, homes.reduce((n, [, count]) => n + count, 0));
    for (const gauge of DEMAND_GAUGES) {
      const expected = homes.reduce(
        (n, [key, count]) => n + homeDemand(SAMPLE_HOMES[key].layout, city)[gauge].coils * count,
        0
      );
      assert.equal(pin.byGauge[gauge].coils, expected);
      // Whole coils always cover the metres needed.
      assert.ok(pin.byGauge[gauge].coils * DEMAND_COIL_METRES >= pin.byGauge[gauge].metres);
    }
  }
});

run("the sample is deterministic", () => {
  const again = SAMPLE_MIX.map(({ city, homes }) =>
    homes.map(([key]) => homeDemand(SAMPLE_HOMES[key].layout, city)["4.0"].coils)
  );
  const first = SAMPLE_MIX.map(({ city, homes }) =>
    homes.map(([key]) => homeDemand(SAMPLE_HOMES[key].layout, city)["4.0"].coils)
  );
  assert.deepEqual(again, first);
});
