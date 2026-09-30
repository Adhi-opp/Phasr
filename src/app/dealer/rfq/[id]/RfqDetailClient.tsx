"use client";

// src/app/dealer/rfq/[id]/RfqDetailClient.tsx
// ============================================================================
// MATERIAL REQUISITION
// ============================================================================
// This is the screen where a distributor decides whether VoltFlow is a real
// tool or a toy, so it is laid out as an incoming requisition sheet rather
// than a notification: a ruled header block carrying the reference and the
// deadline, then three schedules in the order a job is actually priced —
// cable, conduit, distribution — then the bid form.
//
// Cable is stated in coils, not metres. "487 m of 2.5 sq mm" is not something
// anyone sells over a counter; "6 × 90 m coils" is a line a dealer can quote
// against and pull from stock.
//
// Per-line platform pricing is deliberately absent. A requisition asks a
// vendor to price the work; it does not tell them what the buyer thinks each
// line is worth. The aggregate platform estimate stays as one clearly labelled
// reference figure so the dealer knows the order of magnitude expected.
// ============================================================================

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { submitQuoteAction } from "@/features/quotes/actions";
import {
  WIRE_GRADES,
  WIRE_GRADE_META,
  wireGradeShort,
  type WireGrade,
} from "@/features/quotes/wireGrade";
import { QUOTE_VALIDITY_HOURS } from "@/features/quotes/validity";
import {
  Field,
  Metric,
  Row,
  Section,
  SpecTable,
  StatusChip,
  statusTone,
} from "@/components/spec-sheet";
import { BoardScheduleView } from "@/features/calculator/components/BoardScheduleView";
import type { DistributionSchedule } from "@/features/calculator/boardEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BomSnapshot {
  totalConnectedLoadKw: number;
  maxDemandKw: number;
  totalCircuits: number;
  materialCost: number;
  phase: string;
  cable: Array<{
    category: string;
    description: string;
    sizeSqMm: number | null;
    purpose: string;
    totalMeters: number;
    purchasableMeters: number;
    surplusMeters: number;
    coilsRequired: number;
    coilLengthMeters: number;
  }>;
  conduit: Array<{
    description: string;
    sizeMm: string;
    totalMeters: number;
  }>;
  distribution: Array<{
    category: string;
    description: string;
    quantity: number;
    ratingAmps: number | null;
  }>;
  warnings: string[];
}

interface Props {
  rfqId: string;
  rfqStatus: string;
  projectName: string;
  createdAt: string;
  expiresAt: string | null;
  visibilityCity: string;
  bidCount: number;
  maxQuotes: number;
  isApproved: boolean;
  bom: BomSnapshot | null;
  /** Derived server-side; null when the stored BOM predates circuit data. */
  schedule: DistributionSchedule | null;
  fallbackEstimate: number | null;
  existingQuote: {
    id: string;
    totalPrice: number;
    brandOffered: string;
    wireGrade: string | null;
    deliveryDays: number | null;
    validUntil: string | null;
    status: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
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

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function gauge(sizeSqMm: number | null): string {
  return sizeSqMm != null ? `${sizeSqMm.toFixed(1)} mm²` : "—";
}

/** Short, stable reference a dealer can quote back over the phone. */
function requisitionRef(rfqId: string): string {
  return `VF-${rfqId.slice(-8).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RfqDetailClient({
  rfqId,
  rfqStatus,
  projectName,
  createdAt,
  expiresAt,
  visibilityCity,
  bidCount,
  maxQuotes,
  isApproved,
  bom,
  schedule,
  fallbackEstimate,
  existingQuote,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [totalPrice, setTotalPrice] = useState("");
  const [brandOffered, setBrandOffered] = useState("");
  const [wireGrade, setWireGrade] = useState<WireGrade>("FR");
  const [deliveryDays, setDeliveryDays] = useState("");
  const [details, setDetails] = useState("");

  const estimate = bom?.materialCost ?? fallbackEstimate;
  const isOpen = rfqStatus === "OPEN";
  const canSubmit = isOpen && !existingQuote && isApproved;

  const totalCoils = bom?.cable.reduce((sum, c) => sum + c.coilsRequired, 0) ?? 0;
  const totalConduitM =
    bom?.conduit.reduce((sum, c) => sum + c.totalMeters, 0) ?? 0;
  const totalPieces =
    bom?.distribution.reduce((sum, d) => sum + d.quantity, 0) ?? 0;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const price = parseFloat(totalPrice);
    if (isNaN(price) || price <= 0) {
      setError("Enter a valid price.");
      return;
    }

    startTransition(async () => {
      const result = await submitQuoteAction({
        quoteRequestId: rfqId,
        clientRequestId: crypto.randomUUID(),
        totalPrice: price,
        brandOffered: brandOffered.trim(),
        wireGrade,
        deliveryDays: deliveryDays ? parseInt(deliveryDays, 10) : undefined,
        details: details.trim() || undefined,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setSubmitted(true);
    });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-3">
        <Link
          href="/dealer/dashboard"
          className="text-[13px] text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
        >
          &larr; Dealer Dashboard
        </Link>
      </div>

      {/* ── Requisition masthead ─────────────────────────────────────────── */}
      <div className="border border-slate-300 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-300 bg-slate-50 px-3 py-2.5">
          <div>
            <p className="spec-label">Material Requisition</p>
            <h1 className="mt-1 text-lg font-bold leading-tight tracking-tight text-slate-950">
              {projectName}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusChip status={rfqStatus} tone={statusTone(rfqStatus)} />
            <span className="spec-num border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {requisitionRef(rfqId)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4">
          <Field label="Delivery Area" value={visibilityCity} />
          <Field label="Issued" value={formatDate(createdAt)} mono />
          <Field
            label="Bids Close"
            value={expiresAt ? formatDateTime(expiresAt) : "No deadline"}
            mono
          />
          <Field
            label="Bids Received"
            value={`${bidCount} of ${maxQuotes}`}
            mono
          />
        </div>
      </div>

      {!isApproved && (
        <p className="mt-4 border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Your dealer profile is not yet approved, so this requisition is
          read-only. An admin has to clear the account before you can bid.
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-5 lg:items-start">
        {/* ── Schedules ──────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-3">
          {bom ? (
            <>
              <Section
                index={1}
                title="Load Parameters"
                meta="Diversified per IS 732"
              >
                <div className="grid grid-cols-2 divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0">
                  <Metric
                    label="Connected Load"
                    value={`${bom.totalConnectedLoadKw.toFixed(2)} kW`}
                  />
                  <Metric
                    label="Max Demand"
                    value={`${bom.maxDemandKw.toFixed(2)} kW`}
                  />
                  <Metric
                    label="Supply"
                    value={bom.phase === "THREE" ? "3-Phase" : "1-Phase"}
                  />
                  <Metric label="Circuits" value={String(bom.totalCircuits)} />
                </div>
              </Section>

              {bom.cable.length > 0 && (
                <Section
                  index={2}
                  title="Cable Schedule"
                  meta={`${totalCoils} coils total`}
                >
                  <SpecTable
                    minWidth={560}
                    head={[
                      "Gauge",
                      "Purpose",
                      "Required",
                      "Supply As",
                      "Surplus",
                    ]}
                  >
                    {bom.cable.map((line, i) => (
                      <Row key={`${line.description}-${i}`}>
                        <td className="spec-num px-3 py-2.5 font-medium text-slate-900">
                          {gauge(line.sizeSqMm)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">
                          {line.purpose}
                        </td>
                        <td className="spec-num px-3 py-2.5 text-right text-slate-600">
                          {line.totalMeters.toFixed(1)} m
                        </td>
                        <td className="spec-num px-3 py-2.5 text-right font-semibold text-slate-900">
                          {line.coilsRequired > 0
                            ? `${line.coilsRequired} × ${line.coilLengthMeters} m`
                            : `${line.purchasableMeters.toFixed(1)} m`}
                        </td>
                        <td className="spec-num px-3 py-2.5 text-right text-slate-400">
                          {line.surplusMeters > 0
                            ? `+${line.surplusMeters.toFixed(1)} m`
                            : "—"}
                        </td>
                      </Row>
                    ))}
                  </SpecTable>
                </Section>
              )}

              {bom.conduit.length > 0 && (
                <Section
                  index={3}
                  title="Conduit Runs"
                  meta={`${totalConduitM.toFixed(0)} m total`}
                >
                  <SpecTable minWidth={420} head={["Size", "Description", "Length"]}>
                    {bom.conduit.map((line, i) => (
                      <Row key={`${line.description}-${i}`}>
                        <td className="spec-num px-3 py-2.5 font-medium text-slate-900">
                          {line.sizeMm}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">
                          {line.description}
                        </td>
                        <td className="spec-num px-3 py-2.5 text-right text-slate-900">
                          {line.totalMeters.toFixed(1)} m
                        </td>
                      </Row>
                    ))}
                  </SpecTable>
                </Section>
              )}

              {bom.distribution.length > 0 && (
                <Section
                  index={4}
                  title="Distribution & Accessories"
                  meta={`${totalPieces} pcs`}
                >
                  <SpecTable minWidth={420} head={["Item", "Type", "Qty"]}>
                    {bom.distribution.map((line, i) => (
                      <Row key={`${line.description}-${i}`}>
                        <td className="px-3 py-2.5 text-slate-900">
                          {line.description}
                        </td>
                        <td className="px-3 py-2.5 text-right text-[11px] uppercase tracking-[0.08em] text-slate-400">
                          {line.category}
                        </td>
                        <td className="spec-num px-3 py-2.5 text-right font-semibold text-slate-900">
                          {line.quantity}
                        </td>
                      </Row>
                    ))}
                  </SpecTable>
                </Section>
              )}

              {/* The parts above are what gets supplied; this is how they are
                  arranged. A dealer reading a requisition with a board
                  schedule attached is looking at a specified job, not a
                  shopping list someone typed out. */}
              {schedule && (
                <BoardScheduleView schedule={schedule} sectionIndex={5} />
              )}

              {bom.warnings.length > 0 && (
                <Section index={6} title="Notes from the Engine">
                  <ul className="divide-y divide-slate-100">
                    {bom.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="px-3 py-2 text-[13px] leading-relaxed text-slate-600"
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          ) : (
            <div className="border border-slate-200 bg-white px-3 py-10 text-center">
              <p className="text-[13px] text-slate-500">
                No itemised schedule is available for this requisition.
              </p>
              {estimate != null && (
                <p className="spec-num mt-2 text-lg font-semibold text-slate-900">
                  {formatCurrency(estimate)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Bid form ───────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="sticky top-20 border border-slate-300 bg-white">
            <header className="flex items-baseline justify-between gap-2 border-b border-slate-300 bg-slate-50 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {existingQuote ? "Your Bid" : "Submit Bid"}
              </span>
              {estimate != null && (
                <span className="spec-label">
                  Ref. est. {formatCurrency(estimate)}
                </span>
              )}
            </header>

            {existingQuote ? (
              <>
                <div className="grid grid-cols-2">
                  <Field
                    label="Your Price"
                    value={formatCurrency(existingQuote.totalPrice)}
                    mono
                  />
                  <Field label="Brand" value={existingQuote.brandOffered} />
                  <Field
                    label="Wire Grade"
                    value={wireGradeShort(existingQuote.wireGrade) ?? "Not stated"}
                    mono
                  />
                  <Field
                    label="Delivery"
                    value={
                      existingQuote.deliveryDays != null
                        ? `${existingQuote.deliveryDays} days`
                        : "Not stated"
                    }
                    mono
                  />
                  <Field
                    label="Valid Until"
                    value={
                      existingQuote.validUntil
                        ? formatDate(existingQuote.validUntil)
                        : "—"
                    }
                    mono
                  />
                  <Field
                    label="Status"
                    value={
                      <StatusChip
                        status={existingQuote.status}
                        tone={statusTone(existingQuote.status)}
                      />
                    }
                  />
                </div>
                {submitted && (
                  <p className="border-t border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
                    Bid submitted. The buyer has been notified.
                  </p>
                )}
              </>
            ) : canSubmit ? (
              <form className="space-y-3 p-3" onSubmit={onSubmit}>
                {error && (
                  <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                    {error}
                  </p>
                )}
                {submitted && (
                  <p className="border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
                    Bid submitted. The buyer has been notified.
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="totalPrice" className="spec-label">
                    Total Price (INR, ex-GST)
                  </Label>
                  <Input
                    id="totalPrice"
                    type="number"
                    min="1"
                    step="1"
                    className="spec-num h-9"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(e.target.value)}
                    placeholder={estimate != null ? String(estimate) : ""}
                    required
                    disabled={submitted}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="brandOffered" className="spec-label">
                    Brand Offered
                  </Label>
                  <Input
                    id="brandOffered"
                    className="h-9"
                    value={brandOffered}
                    onChange={(e) => setBrandOffered(e.target.value)}
                    placeholder="Polycab"
                    required
                    disabled={submitted}
                  />
                </div>

                {/* Native select, not the popover component: a dealer fills
                    this on a phone in a shop, where the OS picker wins. */}
                <div className="space-y-1.5">
                  <Label htmlFor="wireGrade" className="spec-label">
                    Wire Grade
                  </Label>
                  <select
                    id="wireGrade"
                    value={wireGrade}
                    onChange={(e) => setWireGrade(e.target.value as WireGrade)}
                    disabled={submitted}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-[13px] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {WIRE_GRADES.map((grade) => (
                      <option key={grade} value={grade}>
                        {WIRE_GRADE_META[grade].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="deliveryDays" className="spec-label">
                    Delivery (days, optional)
                  </Label>
                  <Input
                    id="deliveryDays"
                    type="number"
                    min="1"
                    max="365"
                    className="spec-num h-9"
                    value={deliveryDays}
                    onChange={(e) => setDeliveryDays(e.target.value)}
                    disabled={submitted}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="details" className="spec-label">
                    Notes (optional)
                  </Label>
                  <Textarea
                    id="details"
                    className="text-[13px]"
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    disabled={submitted}
                  />
                </div>

                <p className="text-[11px] leading-relaxed text-slate-500">
                  Your price is held for {QUOTE_VALIDITY_HOURS} hours from submission. The buyer sees
                  it alongside competing bids with your brand and grade.
                </p>

                <Button
                  className="h-9 w-full"
                  type="submit"
                  disabled={isPending || submitted}
                >
                  {isPending ? "Submitting…" : "Submit Bid"}
                </Button>
              </form>
            ) : (
              <p className="px-3 py-6 text-center text-[13px] text-slate-500">
                {!isApproved
                  ? "Profile approval required to bid."
                  : `This requisition is ${rfqStatus.toLowerCase()} and is not accepting bids.`}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
