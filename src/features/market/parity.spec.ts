import assert from "node:assert/strict";
import {
  decideParity,
  INDIA_PREMIUM_MULTIPLIER,
  inrPerKgFromUsdPerLb,
  LB_PER_KG,
  parityRupeesPerKg,
} from "./parity";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

// The live inputs on Friday 2 Oct 2026: COMEX HG=F US$6.549/lb (last trade
// 20:59:56 UTC) and the ECB reference rate of ₹96.32 per US$.
const FRIDAY_CLOSE = new Date("2026-10-02T20:59:56Z");
const COMEX = 6.549;
const USD_INR = 96.32;

const fresh = (now: Date) => new Date(now.getTime() - 5 * 60_000);
const WEEKDAY_NOON = new Date("2026-10-05T11:30:00Z"); // Monday, 5:00 PM IST

run("a pound is exactly 0.45359237 kg", () => {
  assert.ok(Math.abs(LB_PER_KG - 2.20462262) < 1e-8);
});

run("US$/lb converts to ₹/kg through the pound and the exchange rate", () => {
  assert.ok(Math.abs(inrPerKgFromUsdPerLb(COMEX, USD_INR) - 1390.675) < 0.01);
});

run("the recorded rate applies the premium and rounds to whole rupees", () => {
  const expected = Math.round(1390.6752 * INDIA_PREMIUM_MULTIPLIER);
  assert.equal(parityRupeesPerKg(COMEX, USD_INR), expected);
  assert.ok(Number.isInteger(parityRupeesPerKg(COMEX, USD_INR)));
});

run("a fresh weekday quote is recorded", () => {
  const d = decideParity({
    usdPerLb: COMEX,
    usdInr: USD_INR,
    quoteTime: fresh(WEEKDAY_NOON),
    now: WEEKDAY_NOON,
    latest: { rate: 1401, effectiveDate: new Date("2026-10-02T11:30:00Z") },
    lastParityAt: null,
  });
  assert.deepEqual(d, { action: "record", rate: parityRupeesPerKg(COMEX, USD_INR) });
});

run("Saturday's run keeps Friday's rate instead of recording a stale quote", () => {
  const d = decideParity({
    usdPerLb: COMEX,
    usdInr: USD_INR,
    quoteTime: FRIDAY_CLOSE,
    now: new Date("2026-10-03T11:30:00Z"),
    latest: null,
    lastParityAt: null,
  });
  assert.equal(d.action, "skip");
  assert.match(d.action === "skip" ? d.reason : "", /weekend or US holiday/);
});

run("a duplicate delivery of the same day's cron records nothing", () => {
  const d = decideParity({
    usdPerLb: COMEX,
    usdInr: USD_INR,
    quoteTime: fresh(WEEKDAY_NOON),
    now: WEEKDAY_NOON,
    latest: null,
    lastParityAt: new Date(WEEKDAY_NOON.getTime() - 60_000),
  });
  assert.equal(d.action, "skip");
});

run("a price in cents, an inverted exchange rate or NaN is refused, not recorded", () => {
  const base = { quoteTime: fresh(WEEKDAY_NOON), now: WEEKDAY_NOON, latest: null, lastParityAt: null };
  for (const [usdPerLb, usdInr] of [
    [654.9, USD_INR], // cents per lb
    [COMEX, 1 / USD_INR], // INR→USD instead of USD→INR
    [Number.NaN, USD_INR],
    [COMEX, Number.NaN],
    [0, USD_INR],
  ]) {
    assert.equal(decideParity({ ...base, usdPerLb, usdInr }).action, "refuse", `${usdPerLb} @ ${usdInr}`);
  }
});

run("inputs that are each plausible but combine beyond ₹5,000/kg are refused", () => {
  const d = decideParity({
    usdPerLb: 19.9,
    usdInr: 149,
    quoteTime: fresh(WEEKDAY_NOON),
    now: WEEKDAY_NOON,
    latest: null,
    lastParityAt: null,
  });
  assert.equal(d.action, "refuse");
});

run("a jump of more than 12% from last week's rate is refused for a manual check", () => {
  const d = decideParity({
    usdPerLb: COMEX,
    usdInr: USD_INR,
    quoteTime: fresh(WEEKDAY_NOON),
    now: WEEKDAY_NOON,
    latest: { rate: 1200, effectiveDate: new Date("2026-10-02T11:30:00Z") },
    lastParityAt: null,
  });
  assert.equal(d.action, "refuse");
  assert.match(d.action === "refuse" ? d.reason : "", /\+\d+\.\d% from the last recorded ₹1200\/kg/);
});

run("the jump guard ignores a rate older than the 7-day lookback", () => {
  const d = decideParity({
    usdPerLb: COMEX,
    usdInr: USD_INR,
    quoteTime: fresh(WEEKDAY_NOON),
    now: WEEKDAY_NOON,
    latest: { rate: 1200, effectiveDate: new Date("2026-09-20T11:30:00Z") },
    lastParityAt: null,
  });
  assert.equal(d.action, "record");
});
