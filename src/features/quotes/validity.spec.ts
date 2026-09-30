import assert from "node:assert/strict";
import {
  QUOTE_EXPIRY_WARNING_HOURS,
  QUOTE_VALIDITY_HOURS,
  RFQ_LIFETIME_HOURS,
  effectiveRfqStatus,
  expiresWithinHours,
  isExpired,
  quoteValidUntilFrom,
  rfqExpiryFrom,
} from "./validity";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

// A fixed clock — these are deadline calculations, and a test that reads the
// wall clock fails at midnight on the last day of a month.
const NOW = new Date("2026-06-15T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

run("RFQ expiry is 72 hours out", () => {
  assert.equal(RFQ_LIFETIME_HOURS, 72);
  assert.equal(
    rfqExpiryFrom(NOW).getTime() - NOW.getTime(),
    RFQ_LIFETIME_HOURS * HOUR
  );
});

run("quote validity is 72 hours out", () => {
  assert.equal(QUOTE_VALIDITY_HOURS, 72);
  assert.equal(
    quoteValidUntilFrom(NOW).getTime() - NOW.getTime(),
    QUOTE_VALIDITY_HOURS * HOUR
  );
});

run("the expiry warning covers only the tail of a quote's life", () => {
  // A quote should not read "expiring soon" on the day it arrives.
  assert.ok(QUOTE_EXPIRY_WARNING_HOURS < QUOTE_VALIDITY_HOURS / 2);
  const dayOld = new Date(NOW.getTime() + 24 * HOUR);
  assert.equal(
    expiresWithinHours(quoteValidUntilFrom(NOW), QUOTE_EXPIRY_WARNING_HOURS, dayOld),
    false
  );
});

run("a null deadline is never expired", () => {
  // Rows written before these fields were populated carry no deadline.
  // Treating null as stale would retroactively kill every existing RFQ.
  assert.equal(isExpired(null, NOW), false);
  assert.equal(isExpired(undefined, NOW), false);
});

run("expiry is inclusive at the boundary", () => {
  // A deadline of exactly now has passed — otherwise a quote is acceptable
  // for one final millisecond at a price the dealer no longer holds.
  assert.equal(isExpired(NOW, NOW), true);
  assert.equal(isExpired(new Date(NOW.getTime() + 1), NOW), false);
  assert.equal(isExpired(new Date(NOW.getTime() - 1), NOW), true);
});

run("isExpired accepts an ISO string, as the view model carries", () => {
  assert.equal(isExpired(new Date(NOW.getTime() - DAY).toISOString(), NOW), true);
  assert.equal(isExpired(new Date(NOW.getTime() + DAY).toISOString(), NOW), false);
});

run("an unparseable deadline is not treated as expired", () => {
  // Better to leave a quote actionable than to silently void it on bad data;
  // acceptQuoteAction re-checks server-side either way.
  assert.equal(isExpired("not-a-date", NOW), false);
});

run("the warning window excludes both the far future and the already-lapsed", () => {
  const within = new Date(NOW.getTime() + 24 * HOUR);
  const outside = new Date(NOW.getTime() + 5 * DAY);
  const lapsed = new Date(NOW.getTime() - HOUR);

  assert.equal(expiresWithinHours(within, QUOTE_EXPIRY_WARNING_HOURS, NOW), true);
  assert.equal(expiresWithinHours(outside, QUOTE_EXPIRY_WARNING_HOURS, NOW), false);
  // Already gone is not "expiring soon" — it renders as Lapsed, not amber.
  assert.equal(expiresWithinHours(lapsed, QUOTE_EXPIRY_WARNING_HOURS, NOW), false);
  assert.equal(expiresWithinHours(null, QUOTE_EXPIRY_WARNING_HOURS, NOW), false);
});

run("a fresh quote is neither lapsed nor expiring soon", () => {
  const validUntil = quoteValidUntilFrom(NOW);
  assert.equal(isExpired(validUntil, NOW), false);
  assert.equal(
    expiresWithinHours(validUntil, QUOTE_EXPIRY_WARNING_HOURS, NOW),
    false
  );
});

run("OPEN past its deadline reads as EXPIRED without any status write", () => {
  const past = new Date(NOW.getTime() - HOUR);
  const future = new Date(NOW.getTime() + HOUR);

  assert.equal(effectiveRfqStatus("OPEN", past, NOW), "EXPIRED");
  assert.equal(effectiveRfqStatus("OPEN", future, NOW), "OPEN");
  assert.equal(effectiveRfqStatus("OPEN", null, NOW), "OPEN");
});

run("a decided status is never overridden by the clock", () => {
  // CLOSED means a quote was accepted. That outcome outlives the window, and
  // showing it as EXPIRED would misrepresent a completed deal.
  const past = new Date(NOW.getTime() - HOUR);
  assert.equal(effectiveRfqStatus("CLOSED", past, NOW), "CLOSED");
  assert.equal(effectiveRfqStatus("DRAFT", past, NOW), "DRAFT");
  assert.equal(effectiveRfqStatus("EXPIRED", past, NOW), "EXPIRED");
});
