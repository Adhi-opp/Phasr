"use client";

// QuotesClient
// ============================================================================
// A comparison matrix on desktop, a card per quote on a phone.
//
// The matrix is the point of this screen at desk width: every quote's price,
// brand and delivery in the same column, so the eye scans down instead of
// across. At phone width the same eight columns needed a sideways swipe to
// reach the price and the Accept button — the two things the buyer came for —
// so below md each quote becomes a bordered card with the price and a
// full-width Accept instead. Both layouts read from the same describe() so
// they can never disagree about what a quote allows.
//
// Quotes arrive pre-sorted by price ascending from the server.
// ============================================================================

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  acceptQuoteAction,
  hideQuoteAction,
  rejectQuoteAction,
} from "@/features/quotes/actions";
import { isQuoteHideable } from "@/features/quotes/validity";
import {
  wireGradeDescription,
  wireGradeShort,
} from "@/features/quotes/wireGrade";
import { BusyLabel } from "@/components/busy-label";
import { Button } from "@/components/ui/button";

interface QuoteData {
  id: string;
  totalPrice: number;
  brandOffered: string;
  wireGrade: string | null;
  deliveryDays: number | null;
  details: string | null;
  status: string;
  createdAt: string;
  validUntil: string | null;
  /** Resolved server-side — see ProjectQuoteView for why not here. */
  hasLapsed: boolean;
  expiresSoon: boolean;
  dealerName: string;
  dealerCity: string;
  dealerEmail: string | null;
  dealerPhone: string | null;
}

interface Props {
  quotes: QuoteData[];
  /** Project estimate, for the spread-vs-estimate summary row. */
  projectEstimate?: number | null;
  /** A quote on this request was accepted before the page loaded. Gates
      Remove, through isQuoteHideable. */
  requestDecided?: boolean;
  /**
   * Demo mode has no session, so the server action would reject every call.
   * Remove is handled locally instead, which is what the visitor is there to
   * see — a button that errors would be worse than no button at all.
   */
  demoMode?: boolean;
}

type PendingAction = { id: string; kind: "accept" | "reject" };

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(iso)
  );
}

function pct(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(0)}%`;
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === "ACCEPTED"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : status === "REJECTED"
        ? "border-slate-200 bg-slate-50 text-slate-400"
        : "border-slate-300 bg-white text-slate-600";

  return (
    <span
      className={`inline-block border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${style}`}
    >
      {status}
    </span>
  );
}

function LowestBadge() {
  return (
    <span className="border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
      Lowest
    </span>
  );
}

function GradeChip({ grade }: { grade: string | null }) {
  const short = wireGradeShort(grade);
  if (!short) return <span className="text-slate-400">—</span>;
  return (
    <span
      className="spec-num border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium"
      title={wireGradeDescription(grade) ?? undefined}
    >
      {short}
    </span>
  );
}

/** Validity is a deadline, so a lapsed or nearly lapsed one is coloured. */
function Validity({ quote }: { quote: QuoteData }) {
  if (!quote.validUntil) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={
        quote.hasLapsed
          ? "font-medium text-destructive"
          : quote.expiresSoon
            ? "font-medium text-amber-700"
            : "text-slate-500"
      }
    >
      {quote.hasLapsed ? "Lapsed" : formatDate(quote.validUntil)}
    </span>
  );
}

/** Remove is deliberately quiet — housekeeping, not a decision. */
function RemoveButton({
  dealerName,
  disabled,
  onClick,
}: {
  dealerName: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className="h-7 w-7 text-slate-400 hover:text-destructive"
      onClick={onClick}
      disabled={disabled}
      title="Remove from this comparison"
      aria-label={`Remove the quote from ${dealerName}`}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

const LAPSED_HINT = "This price has lapsed — ask the dealer to requote.";

export function QuotesClient({
  quotes: initialQuotes,
  projectEstimate,
  requestDecided = false,
  demoMode = false,
}: Props) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  function runAction(
    quoteId: string,
    kind: PendingAction["kind"],
    action: typeof acceptQuoteAction,
    apply: (prev: QuoteData[]) => QuoteData[]
  ) {
    setError(null);
    setPendingAction({ id: quoteId, kind });
    startTransition(async () => {
      const result = await action(quoteId);
      if (!result.success) {
        setError(result.error);
        setPendingAction(null);
        return;
      }
      setQuotes(apply);
      setPendingAction(null);
    });
  }

  function handleAccept(quoteId: string) {
    runAction(quoteId, "accept", acceptQuoteAction, (prev) =>
      prev.map((q) => ({
        ...q,
        status:
          q.id === quoteId
            ? "ACCEPTED"
            : q.status === "SUBMITTED"
              ? "REJECTED"
              : q.status,
      }))
    );
  }

  function handleReject(quoteId: string) {
    runAction(quoteId, "reject", rejectQuoteAction, (prev) =>
      prev.map((q) => (q.id === quoteId ? { ...q, status: "REJECTED" } : q))
    );
  }

  /**
   * Remove: optimistic, because the point of the button is that the row goes
   * away. Waiting ~200ms for a round trip before a dismissal takes effect is
   * exactly the lag that makes people click twice.
   *
   * The row is restored if the server refuses — it can, e.g. on an accepted
   * quote — and the reason is surfaced instead of the row silently returning.
   */
  function handleRemove(quoteId: string) {
    const snapshot = quotes;
    setError(null);
    setQuotes((prev) => prev.filter((q) => q.id !== quoteId));

    if (demoMode) return;

    startTransition(async () => {
      const result = await hideQuoteAction(quoteId);
      if (!result.success) {
        setQuotes(snapshot);
        setError(result.error);
      }
    });
  }

  const hasAccepted = quotes.some((q) => q.status === "ACCEPTED");
  const live = quotes.filter((q) => q.status !== "REJECTED");
  const prices = live.map((q) => q.totalPrice);
  const lowest = prices.length > 0 ? Math.min(...prices) : null;
  const highest = prices.length > 0 ? Math.max(...prices) : null;
  const spread = lowest !== null && highest !== null ? highest - lowest : null;

  const acceptedQuote = quotes.find((q) => q.status === "ACCEPTED");

  /** Everything both layouts need to know about one quote. */
  function describe(quote: QuoteData) {
    const isSubmitted = quote.status === "SUBMITTED";
    const isRejected = quote.status === "REJECTED";
    const isMine = (kind: PendingAction["kind"]) =>
      isPending && pendingAction?.id === quote.id && pendingAction.kind === kind;
    return {
      isSubmitted,
      isRejected,
      isAccepted: quote.status === "ACCEPTED",
      isLowest: lowest !== null && quote.totalPrice === lowest && !isRejected,
      delta: lowest !== null && !isRejected ? quote.totalPrice - lowest : null,
      /** Accept/Reject on offer, on acceptQuoteAction's terms so the buyer is
          never handed a button the server will refuse: until a quote is
          accepted, with Accept disabled once this one's price has lapsed.
          Bidding closing (72 hours, or every slot filled) changes nothing
          here; each quote's own validity is the deadline. */
      decidable: isSubmitted && !hasAccepted,
      /** Remove: hideQuoteAction's rule, shared through isQuoteHideable. */
      removable: isQuoteHideable(
        { status: quote.status, lapsed: quote.hasLapsed },
        requestDecided || hasAccepted
      ),
      accepting: isMine("accept"),
      rejecting: isMine("reject"),
    };
  }

  if (quotes.length === 0) {
    // Distinguish "none arrived" from "you removed them all" — the second is
    // a state the user created, and telling them dealers have been notified
    // would read as if the removal had not worked.
    return (
      <div className="space-y-3">
        {error && (
          <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500">
          {initialQuotes.length > 0
            ? "You have removed every quote on this project. Reload to confirm, or ask for fresh quotes."
            : "No quotes yet. Verified dealers in your area have been notified."}
        </p>
      </div>
    );
  }

  const estimateDelta =
    projectEstimate != null && lowest !== null ? lowest - projectEstimate : null;

  return (
    <div className="space-y-3">
      {error && (
        <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* ── Phones: one card per quote ──────────────────────────────────── */}
      <ul className="space-y-2 md:hidden">
        {quotes.map((quote) => {
          const d = describe(quote);
          return (
            <li
              key={quote.id}
              className={`border px-3 py-3 ${
                d.isAccepted ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`font-medium ${d.isRejected ? "text-slate-400" : "text-slate-900"}`}
                    >
                      {quote.dealerName}
                    </span>
                    {d.isLowest && d.isSubmitted && <LowestBadge />}
                  </div>
                  {quote.dealerCity && (
                    <p className="text-[11px] text-slate-500">{quote.dealerCity}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!d.decidable && <StatusPill status={quote.status} />}
                  {d.removable && (
                    <RemoveButton
                      dealerName={quote.dealerName}
                      disabled={isPending}
                      onClick={() => handleRemove(quote.id)}
                    />
                  )}
                </div>
              </div>

              <p
                className={`mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] ${
                  d.isRejected ? "text-slate-400" : "text-slate-600"
                }`}
              >
                Brand:{" "}
                <span className={d.isRejected ? "" : "text-slate-900"}>{quote.brandOffered}</span>
                <span aria-hidden="true" className="text-slate-300">
                  |
                </span>
                Grade: <GradeChip grade={quote.wireGrade} />
              </p>

              <div className="mt-2 flex items-baseline justify-between gap-3">
                <span className="spec-label">Total (ex-GST)</span>
                <span
                  className={`spec-num text-lg font-semibold ${
                    d.isRejected ? "text-slate-400 line-through" : "text-slate-900"
                  }`}
                >
                  {formatINR(quote.totalPrice)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[11px] text-slate-500">
                <span className="spec-num">
                  {d.delta ? `+${formatINR(d.delta)} vs lowest` : ""}
                </span>
                <span>
                  Delivery{" "}
                  <span className="spec-num">
                    {quote.deliveryDays != null ? `${quote.deliveryDays} d` : "—"}
                  </span>{" "}
                  · Valid until <Validity quote={quote} />
                </span>
              </div>

              {d.decidable && (
                <div className="mt-3 space-y-2">
                  <Button
                    className="w-full"
                    onClick={() => handleAccept(quote.id)}
                    disabled={isPending || quote.hasLapsed}
                    aria-busy={d.accepting}
                  >
                    <BusyLabel busy={d.accepting} busyText="Accepting…">
                      Accept Quote
                    </BusyLabel>
                  </Button>
                  {quote.hasLapsed && (
                    <p className="text-[11px] text-destructive">{LAPSED_HINT}</p>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleReject(quote.id)}
                    disabled={isPending}
                    aria-busy={d.rejecting}
                  >
                    <BusyLabel busy={d.rejecting} busyText="Rejecting…">
                      Reject
                    </BusyLabel>
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {live.length > 1 && lowest !== null && (
        <dl className="space-y-1 border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] md:hidden">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="spec-label">{live.length} live quotes · lowest</dt>
            <dd className="spec-num font-semibold text-slate-900">{formatINR(lowest)}</dd>
          </div>
          {spread !== null && spread > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="spec-label">Spread</dt>
              <dd className="spec-num text-slate-600">
                {formatINR(spread)} <span className="text-slate-400">({pct(spread, lowest)})</span>
              </dd>
            </div>
          )}
          {estimateDelta !== null && projectEstimate != null && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="spec-label">vs your estimate</dt>
              <dd
                className={`spec-num ${estimateDelta <= 0 ? "text-emerald-700" : "text-amber-700"}`}
              >
                {estimateDelta <= 0 ? "−" : "+"}
                {formatINR(Math.abs(estimateDelta))} ({pct(Math.abs(estimateDelta), projectEstimate)})
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* ── md and up: the comparison matrix ────────────────────────────── */}
      <div className="hidden border border-slate-200 bg-white md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="spec-label px-3 py-2 text-left font-medium">
                  Dealer
                </th>
                <th className="spec-label px-3 py-2 text-left font-medium">
                  Brand
                </th>
                <th className="spec-label px-3 py-2 text-left font-medium">
                  Wire Grade
                </th>
                <th className="spec-label px-3 py-2 text-right font-medium">
                  Total (ex-GST)
                </th>
                <th className="spec-label px-3 py-2 text-right font-medium">
                  vs Lowest
                </th>
                <th className="spec-label px-3 py-2 text-right font-medium">
                  Delivery
                </th>
                {/* Was "Quoted". On a screen where you are deciding right
                    now, when a quote arrived is trivia and when it lapses is
                    a deadline. The arrival date moved to this cell's title. */}
                <th className="spec-label px-3 py-2 text-right font-medium">
                  Valid Until
                </th>
                <th className="spec-label px-3 py-2 text-right font-medium">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => {
                const d = describe(quote);
                return (
                  <tr
                    key={quote.id}
                    className={`border-b border-slate-100 last:border-b-0 ${
                      d.isAccepted
                        ? "bg-emerald-50/60"
                        : d.isRejected
                          ? "text-slate-400"
                          : "hover:bg-slate-50/70"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${d.isRejected ? "text-slate-400" : "text-slate-900"}`}
                        >
                          {quote.dealerName}
                        </span>
                        {d.isLowest && d.isSubmitted && <LowestBadge />}
                      </div>
                      {quote.dealerCity && (
                        <span className="text-[11px] text-slate-500">
                          {quote.dealerCity}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{quote.brandOffered}</td>
                    <td className="px-3 py-2.5">
                      <GradeChip grade={quote.wireGrade} />
                    </td>
                    <td
                      className={`spec-num px-3 py-2.5 text-right font-semibold ${
                        d.isRejected ? "line-through" : "text-slate-900"
                      }`}
                    >
                      {formatINR(quote.totalPrice)}
                    </td>
                    <td className="spec-num px-3 py-2.5 text-right text-slate-500">
                      {d.delta ? `+${formatINR(d.delta)}` : "—"}
                    </td>
                    <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                      {quote.deliveryDays != null ? `${quote.deliveryDays} d` : "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right text-[11px]"
                      title={`Quoted ${formatDate(quote.createdAt)}`}
                    >
                      <Validity quote={quote} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {d.decidable ? (
                          <>
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => handleAccept(quote.id)}
                              disabled={isPending || quote.hasLapsed}
                              aria-busy={d.accepting}
                              title={quote.hasLapsed ? LAPSED_HINT : undefined}
                            >
                              <BusyLabel busy={d.accepting} busyText="Accepting…">
                                Accept
                              </BusyLabel>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => handleReject(quote.id)}
                              disabled={isPending}
                              aria-busy={d.rejecting}
                            >
                              <BusyLabel busy={d.rejecting} busyText="Rejecting…">
                                Reject
                              </BusyLabel>
                            </Button>
                          </>
                        ) : (
                          <StatusPill status={quote.status} />
                        )}

                        {/* Withheld on the accepted quote, whose row carries
                            the dealer's contact details. */}
                        {d.removable && (
                          <RemoveButton
                            dealerName={quote.dealerName}
                            disabled={isPending}
                            onClick={() => handleRemove(quote.id)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {live.length > 1 && (
              <tfoot>
                <tr className="border-t border-slate-300 bg-slate-50">
                  {/* colSpan tracks the 8 header cells: Dealer, Brand,
                      Wire Grade | Total | vs Lowest, Delivery, Valid Until | Action */}
                  <td className="spec-label px-3 py-2" colSpan={3}>
                    {live.length} live quotes
                  </td>
                  <td className="spec-num px-3 py-2 text-right font-semibold text-slate-900">
                    {lowest !== null && formatINR(lowest)}
                  </td>
                  <td
                    className="spec-num px-3 py-2 text-right text-slate-600"
                    colSpan={3}
                  >
                    {spread !== null && spread > 0 && lowest !== null && (
                      <>
                        spread {formatINR(spread)}
                        <span className="ml-1 text-slate-400">({pct(spread, lowest)})</span>
                      </>
                    )}
                  </td>
                  <td />
                </tr>
                {estimateDelta !== null && projectEstimate != null && (
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="spec-label px-3 py-2" colSpan={3}>
                      vs your estimate
                    </td>
                    <td className="spec-num px-3 py-2 text-right text-slate-600">
                      {formatINR(projectEstimate)}
                    </td>
                    <td
                      className="spec-num px-3 py-2 text-right"
                      colSpan={3}
                    >
                      <span
                        className={
                          estimateDelta <= 0 ? "text-emerald-700" : "text-amber-700"
                        }
                      >
                        {estimateDelta <= 0 ? "−" : "+"}
                        {formatINR(Math.abs(estimateDelta))} (
                        {pct(Math.abs(estimateDelta), projectEstimate)})
                      </span>
                    </td>
                    <td />
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Dealer notes are long-form; they do not belong in the matrix. */}
      {quotes.some((q) => q.details) && (
        <div className="border border-slate-200 bg-white">
          <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Dealer Notes
          </p>
          <ul className="divide-y divide-slate-100">
            {quotes
              .filter((q) => q.details)
              .map((q) => (
                <li key={q.id} className="px-3 py-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {q.dealerName}
                  </span>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">
                    {q.details}
                  </p>
                </li>
              ))}
          </ul>
        </div>
      )}

      {acceptedQuote && (acceptedQuote.dealerEmail || acceptedQuote.dealerPhone) && (
        <div className="border border-emerald-300 bg-emerald-50 px-3 py-2.5">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
            Contact — {acceptedQuote.dealerName}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-0.5 text-[13px] text-emerald-900">
            {acceptedQuote.dealerEmail && (
              <span className="spec-num">{acceptedQuote.dealerEmail}</span>
            )}
            {acceptedQuote.dealerPhone && (
              <span className="spec-num">{acceptedQuote.dealerPhone}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
