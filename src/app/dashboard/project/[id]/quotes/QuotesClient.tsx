"use client";

// QuotesClient
// ============================================================================
// A comparison matrix, not a card grid. The whole job of this screen is
// answering "which of these is actually better", and that means every quote's
// price, brand and delivery sitting in the same column so the eye can scan
// down instead of across. Cards made the reader hold four numbers in memory.
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
import {
  wireGradeDescription,
  wireGradeShort,
} from "@/features/quotes/wireGrade";
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
  /** Gates Remove on live quotes — see canRemove. */
  rfqStatus?: string;
  /**
   * Demo mode has no session, so the server action would reject every call.
   * Remove is handled locally instead, which is what the visitor is there to
   * see — a button that errors would be worse than no button at all.
   */
  demoMode?: boolean;
}

/**
 * Mirrors the guard in hideQuoteAction. Kept in sync deliberately: the server
 * is the authority, but offering a button that always errors is its own bug.
 *
 * A live quote on an open request is not removable — the dealer is waiting on
 * an answer, and the honest way to clear it is Reject. Once the request is
 * closed or expired nobody is waiting, so stale rows can go.
 */
function canRemove(status: string, rfqStatus: string): boolean {
  if (status === "ACCEPTED") return false;
  if (status === "SUBMITTED") return rfqStatus !== "OPEN";
  return true;
}

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

export function QuotesClient({
  quotes: initialQuotes,
  projectEstimate,
  rfqStatus = "CLOSED",
  demoMode = false,
}: Props) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  function runAction(
    quoteId: string,
    action: typeof acceptQuoteAction,
    apply: (prev: QuoteData[]) => QuoteData[]
  ) {
    setError(null);
    setActionId(quoteId);
    startTransition(async () => {
      const result = await action(quoteId);
      if (!result.success) {
        setError(result.error);
        setActionId(null);
        return;
      }
      setQuotes(apply);
      setActionId(null);
    });
  }

  function handleAccept(quoteId: string) {
    runAction(quoteId, acceptQuoteAction, (prev) =>
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
    runAction(quoteId, rejectQuoteAction, (prev) =>
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

  return (
    <div className="space-y-3">
      {error && (
        <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
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
                const isSubmitted = quote.status === "SUBMITTED";
                const isRejected = quote.status === "REJECTED";
                const isAccepted = quote.status === "ACCEPTED";
                const isLowest =
                  lowest !== null && quote.totalPrice === lowest && !isRejected;
                const delta =
                  lowest !== null && !isRejected ? quote.totalPrice - lowest : null;
                const isProcessing = isPending && actionId === quote.id;
                // Mirrors the guard in acceptQuoteAction. Offering Accept on a
                // price the server will refuse is a dead end the buyer only
                // discovers after clicking.
                const { hasLapsed, expiresSoon } = quote;

                return (
                  <tr
                    key={quote.id}
                    className={`border-b border-slate-100 last:border-b-0 ${
                      isAccepted
                        ? "bg-emerald-50/60"
                        : isRejected
                          ? "text-slate-400"
                          : "hover:bg-slate-50/70"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${isRejected ? "text-slate-400" : "text-slate-900"}`}
                        >
                          {quote.dealerName}
                        </span>
                        {isLowest && isSubmitted && (
                          <span className="border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                            Lowest
                          </span>
                        )}
                      </div>
                      {quote.dealerCity && (
                        <span className="text-[11px] text-slate-500">
                          {quote.dealerCity}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">{quote.brandOffered}</td>
                    <td className="px-3 py-2.5">
                      {wireGradeShort(quote.wireGrade) ? (
                        <span
                          className="spec-num border border-slate-300 px-1.5 py-0.5 text-[11px] font-medium"
                          title={wireGradeDescription(quote.wireGrade) ?? undefined}
                        >
                          {wireGradeShort(quote.wireGrade)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className={`spec-num px-3 py-2.5 text-right font-semibold ${
                        isRejected ? "line-through" : "text-slate-900"
                      }`}
                    >
                      {formatINR(quote.totalPrice)}
                    </td>
                    <td className="spec-num px-3 py-2.5 text-right text-slate-500">
                      {delta === null
                        ? "—"
                        : delta === 0
                          ? "—"
                          : `+${formatINR(delta)}`}
                    </td>
                    <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                      {quote.deliveryDays != null ? `${quote.deliveryDays} d` : "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right text-[11px]"
                      title={`Quoted ${formatDate(quote.createdAt)}`}
                    >
                      {quote.validUntil ? (
                        <span
                          className={
                            hasLapsed
                              ? "font-medium text-destructive"
                              : expiresSoon
                                ? "font-medium text-amber-700"
                                : "text-slate-500"
                          }
                        >
                          {hasLapsed ? "Lapsed" : formatDate(quote.validUntil)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isSubmitted && !hasAccepted ? (
                          <>
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => handleAccept(quote.id)}
                              disabled={isPending || hasLapsed}
                              title={
                                hasLapsed
                                  ? "This price has lapsed — ask the dealer to requote."
                                  : undefined
                              }
                            >
                              {isProcessing ? "…" : "Accept"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => handleReject(quote.id)}
                              disabled={isPending}
                            >
                              Reject
                            </Button>
                          </>
                        ) : (
                          <StatusPill status={quote.status} />
                        )}

                        {/* Remove is deliberately quiet — it is housekeeping,
                            not a decision. Withheld on the accepted quote,
                            whose row carries the dealer's contact details. */}
                        {canRemove(quote.status, rfqStatus) && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-destructive"
                            onClick={() => handleRemove(quote.id)}
                            disabled={isPending}
                            title="Remove from this comparison"
                            aria-label={`Remove the quote from ${quote.dealerName}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
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
                      Wire Grade | Total | vs Lowest, Delivery, Quoted | Action */}
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
                    {spread !== null && spread > 0 && (
                      <>
                        spread {formatINR(spread)}
                        {lowest ? (
                          <span className="ml-1 text-slate-400">
                            ({((spread / lowest) * 100).toFixed(0)}%)
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td />
                </tr>
                {projectEstimate != null && lowest !== null && (
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
                          lowest <= projectEstimate
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }
                      >
                        {lowest <= projectEstimate ? "−" : "+"}
                        {formatINR(Math.abs(lowest - projectEstimate))} (
                        {(
                          (Math.abs(lowest - projectEstimate) / projectEstimate) *
                          100
                        ).toFixed(0)}
                        %)
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
