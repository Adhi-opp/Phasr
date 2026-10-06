import assert from "node:assert/strict";
import { PINCODE_FORMAT_MESSAGE, pincodeIssue } from "./pincode";
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

run("A pin code is six digits and never starts with 0", () => {
  assert.equal(pincodeIssue("110020", "Delhi"), null);
  for (const bad of ["", "11002", "1100201", "011002", "11002a", "110 02"]) {
    assert.equal(pincodeIssue(bad, "Delhi"), PINCODE_FORMAT_MESSAGE, JSON.stringify(bad));
  }
});

run("Each NCR city takes a pin code from its own state", () => {
  const valid: [string, string][] = [
    ["Delhi", "110020"],
    ["Gurugram", "122002"],
    ["Faridabad", "121001"],
    ["Noida", "201301"],
    ["Greater Noida", "201310"],
    ["Greater Noida", "203207"],
    ["Ghaziabad", "201001"],
  ];
  for (const [city, pincode] of valid) {
    assert.equal(pincodeIssue(pincode, city), null, `${city} ${pincode}`);
  }
});

run("A pin code from another state is refused, since the city picks the supply rule", () => {
  // A Noida home entered as Delhi would get Delhi's 10 kW rule, not UP's 5 kW.
  assert.match(pincodeIssue("201301", "Delhi") ?? "", /outside Delhi/);
  assert.match(pincodeIssue("110020", "Noida") ?? "", /outside Uttar Pradesh/);
  assert.match(pincodeIssue("201301", "Gurugram") ?? "", /outside Haryana/);
  // Same state, another district: the rule is the state's, so it passes.
  assert.equal(pincodeIssue("122002", "Faridabad"), null);
});

run("Without an NCR state to check against, any valid pin code passes", () => {
  // "NCR" alone (older estimates) names no state; nor does a missing city.
  assert.equal(pincodeIssue("201301", "NCR"), null);
  assert.equal(pincodeIssue("400001", undefined), null);
  assert.equal(pincodeIssue("400001", "Mumbai"), null);
});

const layout = {
  propertyType: "FLAT",
  city: "Gurugram",
  bedrooms: 2,
  bathrooms: 2,
  balconies: 1,
  totalFloors: 1,
  modularKitchen: false,
  acInBedrooms: true,
  acInLivingRoom: true,
  geyserInBathrooms: true,
} as const;

run("The layout schema still accepts a layout with no pin code", () => {
  // A plan read by Snap-to-BOM has none, and neither do drafts saved before
  // the calculator asked. Saving requires one (createQuoteRequestAction).
  assert.equal(layoutSchema.safeParse(layout).success, true);
});

run("The layout schema keeps a valid pin code, trimmed", () => {
  const parsed = layoutSchema.safeParse({ ...layout, pincode: " 122002 " });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.pincode, "122002");
});

run("The layout schema refuses a malformed or out-of-state pin code, on the pin code field", () => {
  for (const pincode of ["12200", "201301"]) {
    const parsed = layoutSchema.safeParse({ ...layout, pincode });
    assert.equal(parsed.success, false, pincode);
    const issues = parsed.error?.issues ?? [];
    assert.equal(issues.length, 1, `${pincode}: ${JSON.stringify(issues)}`);
    assert.deepEqual(issues[0].path, ["pincode"]);
  }
});
