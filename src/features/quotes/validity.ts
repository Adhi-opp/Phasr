// src/features/quotes/validity.ts
// ============================================================================
// RFQ AND QUOTE LIFETIMES
// ============================================================================
// Pure constants and date maths. No imports, no Prisma, no server-only — the
// seed script imports this by relative path, and anything that touches the
// database here would break `tsx prisma/seed.ts`.
//
// Two clocks, for two different reasons:
//
//   RFQ_LIFETIME_HOURS (72)
//     How long a request stays open to dealers. Short enough that a buyer is
//     still in a buying frame of mind when the quotes land, long enough to
//     span a weekend. Enforced in submitQuoteTransaction, which already
//     rejected expired requests — the field was simply never being set.
//
//   QUOTE_VALIDITY_HOURS (72)
//     How long a dealer's price is binding. Copper is the volatile half of
//     this BOM (cable is ~55% of material cost) and list prices were revised
//     every few weeks through 2026, so an open-ended quote asks the dealer to
//     absorb a commodity swing they cannot hedge. 48–72 hours is the window
//     dealers will actually hold a copper-linked price for; a week was not.
//     Always set by the server — submitQuoteSchema does not accept a date.
//
// The first clock governs dealers, the second governs the buyer. A request
// stops taking bids when its 72 hours run out or every bid slot is filled,
// but the buyer can still accept any bid until that bid's own validity ends.
// Closing the bidding must never take the choice away: waiting for every bid
// before deciding is the point of a sealed-bid auction.
//
// A request's stored status therefore means:
//   DRAFT   saved, never shown to dealers
//   OPEN    shown to dealers and not yet decided; whether it still takes bids
//           is derived from expiresAt and quoteCount, never stored
//   CLOSED  the buyer accepted a quote. Nothing else sets it.
// ============================================================================

export const RFQ_LIFETIME_HOURS = 72;
export const QUOTE_VALIDITY_HOURS = 72;

export function rfqExpiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + RFQ_LIFETIME_HOURS * 60 * 60 * 1000);
}

export function quoteValidUntilFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + QUOTE_VALIDITY_HOURS * 60 * 60 * 1000);
}

/**
 * True when a deadline has passed.
 *
 * A null deadline is never expired — rows created before these fields were
 * populated have no expiry, and treating them as stale would retroactively
 * kill every existing RFQ and quote in the database.
 */
export function isExpired(
  deadline: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!deadline) return false;
  const time =
    typeof deadline === "string" ? new Date(deadline).getTime() : deadline.getTime();
  return Number.isFinite(time) && time <= now.getTime();
}

/** Not yet lapsed, but inside the warning window. */
export function expiresWithinHours(
  deadline: Date | string | null | undefined,
  hours: number,
  now: Date = new Date()
): boolean {
  if (!deadline || isExpired(deadline, now)) return false;
  return isExpired(deadline, new Date(now.getTime() + hours * 60 * 60 * 1000));
}

/** How close to lapsing a quote has to be before the matrix flags it. The
    final third of the 72-hour window; at 48 hours a quote would read as
    expiring soon a day after it arrived. */
export const QUOTE_EXPIRY_WARNING_HOURS = 24;

/**
 * The status a buyer should actually see.
 *
 * Nothing flips QuoteRequest.status to EXPIRED — that would need a scheduled
 * job, and this project deliberately has no cron, queue or worker. Deriving it
 * at read time is equivalent for display purposes and costs nothing: the row
 * is already loaded, and submitQuoteTransaction independently refuses quotes
 * past expiresAt, so the write path is safe regardless of what is rendered.
 */
export function effectiveRfqStatus(
  status: string,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): string {
  return status === "OPEN" && isExpired(expiresAt, now) ? "EXPIRED" : status;
}

/** The request fields every rule below reads. */
export interface RequestClock {
  status: string;
  expiresAt: Date | string | null | undefined;
  quoteCount: number;
  maxQuotes: number;
}

/** Every bid slot is taken. submitQuoteTransaction refuses the next bid. */
export function isRequestFull(quoteCount: number, maxQuotes: number): boolean {
  return quoteCount >= maxQuotes;
}

/**
 * Whether a dealer can still bid: open, inside its 72 hours, with a slot
 * free. submitQuoteTransaction checks each condition itself under a row lock;
 * this is the same rule for the screens that decide whether to offer the form.
 */
export function isTakingBids(request: RequestClock, now: Date = new Date()): boolean {
  return (
    request.status === "OPEN" &&
    !isExpired(request.expiresAt, now) &&
    !isRequestFull(request.quoteCount, request.maxQuotes)
  );
}

/**
 * The status a dealer should see: effectiveRfqStatus, plus FULL once every
 * bid slot is taken. A full request stays OPEN in the database, because its
 * buyer has still to choose, but to a dealer it is closed to bidding.
 */
export function dealerRfqStatus(request: RequestClock, now: Date = new Date()): string {
  const status = effectiveRfqStatus(request.status, request.expiresAt, now);
  return status === "OPEN" && isRequestFull(request.quoteCount, request.maxQuotes)
    ? "FULL"
    : status;
}

/**
 * Where a request stands for its buyer.
 *
 *   DRAFT           saved, never sent to dealers
 *   OPEN            dealers can still bid
 *   BIDDING_CLOSED  no more bids (72 hours passed, or every slot is full),
 *                   but quotes came in, and any still inside its validity
 *                   can be accepted
 *   EXPIRED         bidding ended with no quotes at all
 *   ACCEPTED        the buyer accepted a quote
 */
export type BuyerRequestState = "DRAFT" | "OPEN" | "BIDDING_CLOSED" | "EXPIRED" | "ACCEPTED";

export function buyerRequestState(
  request: RequestClock,
  now: Date = new Date()
): BuyerRequestState {
  if (request.status === "DRAFT") return "DRAFT";
  if (request.status === "CLOSED") return "ACCEPTED";
  if (isTakingBids(request, now)) return "OPEN";
  return request.quoteCount > 0 ? "BIDDING_CLOSED" : "EXPIRED";
}

/** What the two buyer rules below need to know about a quote. */
export interface QuoteStanding {
  status: string;
  /** Past its validUntil. Resolved by the caller, so a client component can
      pass the server's answer instead of reading its own clock. */
  lapsed: boolean;
}

/**
 * Whether the buyer can still accept a quote: submitted, its price not
 * lapsed, and no quote on the request accepted yet (`requestDecided`).
 *
 * The request's own deadline and its quote limit are deliberately absent.
 * They stop new bids; they do not end the buyer's choice. acceptQuoteAction
 * enforces this, and the quote matrix offers Accept on the same terms.
 */
export function isQuoteAcceptable(quote: QuoteStanding, requestDecided: boolean): boolean {
  return quote.status === "SUBMITTED" && !quote.lapsed && !requestDecided;
}

/**
 * Whether the buyer may hide a quote from their comparison ("Remove").
 *
 * Never the accepted quote: its row is the only place the dealer's contact
 * details appear. Never a quote that could still be accepted: its dealer is
 * waiting for an answer, and the honest way to clear it is Reject. Anything
 * else is a stale row. hideQuoteAction enforces this; the matrix mirrors it.
 */
export function isQuoteHideable(quote: QuoteStanding, requestDecided: boolean): boolean {
  if (quote.status === "ACCEPTED") return false;
  return !isQuoteAcceptable(quote, requestDecided);
}
