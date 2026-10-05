import assert from "node:assert/strict";
import { calculateBOM } from "./calculateBOM";
import { buildCalculatorInput } from "./generateRoomSpecs";
import { PRESETS } from "./presets";
import { layoutSchema } from "./schemas";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

for (const preset of PRESETS) {
  run(`${preset.label}: the badge says what the engine recommends`, () => {
    assert.equal(layoutSchema.safeParse(preset.layout).success, true);
    const bom = calculateBOM(buildCalculatorInput(preset.layout));
    assert.equal(bom.recommendedPhase, preset.phase === "Three" ? "THREE" : "SINGLE");
  });
}
