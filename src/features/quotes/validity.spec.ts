import assert from "node:assert/strict";
import {
  QUOTE_EXPIRY_WARNING_HOURS,
  QUOTE_VALIDITY_HOURS,
  RFQ_LIFETIME_HOURS,
  buyerRequestState,
  dealerRfqStatus,
  effectiveRfqStatus,
  expiresWithinHours,
  isExpired,
  isQuoteAcceptable,
  isQuoteHideable,
  isRequestFull,
  isTakingBids,
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

// ---------------------------------------------------------------------------
// Bidding, and the buyer's choice
// ---------------------------------------------------------------------------

const live = new Date(NOW.getTime() + DAY);
const past = new Date(NOW.getTime() - HOUR);
const request = (over: Partial<Parameters<typeof isTakingBids>[0]> = {}) => ({
  status: "OPEN",
  expiresAt: live,
  quoteCount: 2,
  maxQuotes: 5,
  ...over,
});

run("a request is full exactly at its quote limit", () => {
  assert.equal(isRequestFull(4, 5), false);
  assert.equal(isRequestFull(5, 5), true);
});

run("dealers can bid only while a request is open, in time and not full", () => {
  assert.equal(isTakingBids(request(), NOW), true);
  assert.equal(isTakingBids(request({ quoteCount: 5 }), NOW), false);
  assert.equal(isTakingBids(request({ expiresAt: past }), NOW), false);
  assert.equal(isTakingBids(request({ status: "DRAFT", expiresAt: null }), NOW), false);
  assert.equal(isTakingBids(request({ status: "CLOSED" }), NOW), false);
});

run("a dealer sees FULL on a request whose slots are taken", () => {
  assert.equal(dealerRfqStatus(request({ quoteCount: 5 }), NOW), "FULL");
  assert.equal(dealerRfqStatus(request(), NOW), "OPEN");
  // Past its deadline it reads EXPIRED, full or not: the clock speaks first.
  assert.equal(dealerRfqStatus(request({ quoteCount: 5, expiresAt: past }), NOW), "EXPIRED");
  assert.equal(dealerRfqStatus(request({ status: "CLOSED", quoteCount: 5 }), NOW), "CLOSED");
});

run("the buyer's view of each stage of a request", () => {
  assert.equal(buyerRequestState(request({ status: "DRAFT", expiresAt: null, quoteCount: 0 }), NOW), "DRAFT");
  assert.equal(buyerRequestState(request(), NOW), "OPEN");
  assert.equal(buyerRequestState(request({ quoteCount: 5 }), NOW), "BIDDING_CLOSED");
  assert.equal(buyerRequestState(request({ expiresAt: past }), NOW), "BIDDING_CLOSED");
  assert.equal(buyerRequestState(request({ expiresAt: past, quoteCount: 0 }), NOW), "EXPIRED");
  assert.equal(buyerRequestState(request({ status: "CLOSED", quoteCount: 5 }), NOW), "ACCEPTED");
});

run("a full or timed-out request still lets the buyer accept a valid quote", () => {
  // The bug this guards: filling the last slot set the request to CLOSED, and
  // acceptance then refused every quote on it. Bidding ending is not the
  // buyer's deadline; each quote's own validity is.
  for (const r of [request({ quoteCount: 5 }), request({ expiresAt: past })]) {
    const state = buyerRequestState(r, NOW);
    const decided = state === "ACCEPTED";
    assert.equal(state, "BIDDING_CLOSED");
    assert.equal(isQuoteAcceptable({ status: "SUBMITTED", lapsed: false }, decided), true);
  }
});

run("only a submitted, unlapsed quote on an undecided request is acceptable", () => {
  assert.equal(isQuoteAcceptable({ status: "SUBMITTED", lapsed: false }, false), true);
  assert.equal(isQuoteAcceptable({ status: "SUBMITTED", lapsed: true }, false), false);
  assert.equal(isQuoteAcceptable({ status: "SUBMITTED", lapsed: false }, true), false);
  assert.equal(isQuoteAcceptable({ status: "REJECTED", lapsed: false }, false), false);
  assert.equal(isQuoteAcceptable({ status: "ACCEPTED", lapsed: false }, true), false);
});

run("Remove is offered only where nobody is left waiting", () => {
  // The accepted row carries the dealer's contact details: never hideable.
  assert.equal(isQuoteHideable({ status: "ACCEPTED", lapsed: false }, true), false);
  assert.equal(isQuoteHideable({ status: "ACCEPTED", lapsed: true }, true), false);
  // A quote the buyer could still accept has a dealer waiting on an answer.
  assert.equal(isQuoteHideable({ status: "SUBMITTED", lapsed: false }, false), false);
  // Lapsed, or overtaken by an accepted quote: stale, so it can go.
  assert.equal(isQuoteHideable({ status: "SUBMITTED", lapsed: true }, false), true);
  assert.equal(isQuoteHideable({ status: "SUBMITTED", lapsed: false }, true), true);
  assert.equal(isQuoteHideable({ status: "REJECTED", lapsed: false }, false), true);
});
