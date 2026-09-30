import assert from "node:assert/strict";
import { formatBomForWhatsApp, whatsappShareUrl } from "./whatsappExport";
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

const result = applyPricing(
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

const text = formatBomForWhatsApp(result);

run("chit has a bold section for every category the BOM contains", () => {
  for (const head of ["*VoltFlow Material Spec*", "*Cable*", "*Protection*", "*Conduit*", "*Switches & Sockets*"]) {
    assert.ok(text.includes(head), `missing ${head}`);
  }
});

run("every cable line is in coils, in counter vocabulary", () => {
  const cables = result.items.filter((i) => i.category === "WIRE" || i.category === "EARTH_WIRE");
  assert.ok(cables.length > 0);
  for (const c of cables) {
    if (c.category !== "WIRE" && c.category !== "EARTH_WIRE") continue;
    const expected = `${c.sizeSqMm} sqmm`;
    const coil = `${c.coilsRequired} × ${c.coilLengthMeters} m coil`;
    assert.ok(
      text.split("\n").some((line) => line.startsWith(expected) && line.includes(coil)),
      `no line for ${expected} ${coil}`
    );
  }
  assert.ok(!text.includes("sq mm"), "uses sqmm, not the engine's 'sq mm'");
});

run("carries no prices, so it cannot anchor a dealer's bid", () => {
  assert.ok(!text.includes("₹"));
  assert.ok(!/\bRs\.?\s?\d/.test(text));
});

run("footer link appears only when an app URL is given, without a trailing slash", () => {
  assert.ok(!text.includes("via VoltFlow"));
  const withUrl = formatBomForWhatsApp(result, "https://voltflow.in/");
  assert.ok(withUrl.endsWith("— via VoltFlow https://voltflow.in"));
});

run("share URL is a wa.me link whose text round-trips exactly", () => {
  const url = whatsappShareUrl(text);
  assert.ok(url.startsWith("https://wa.me/?text="));
  const decoded = decodeURIComponent(url.slice("https://wa.me/?text=".length));
  assert.equal(decoded, text);
});
