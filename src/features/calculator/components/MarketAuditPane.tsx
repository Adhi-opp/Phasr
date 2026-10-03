"use client";

// src/features/calculator/components/MarketAuditPane.tsx
// ============================================================================
// MARKET AUDIT PANE
// ============================================================================
// The only cost summary on the BOM sheet. Materials only. Three dense rows:
//   1. The math   — MRP (estimated), reference price, fair ceiling
//   2. The split  — where the reference money goes, as one thin bar
//   3. The audit  — [ ₹ amount ] [ Check ] against the fair ceiling
//
// No savings headline. MRP is a ceiling that almost nobody pays in full, so
// MRP minus the reference overstates what a buyer can actually save. The only
// rupee gap the pane states is between a real quote and the fair ceiling.
//
// The audit input is local state and never leaves the browser: no save, no
// server action, no analytics. Someone typing what their electrician charged
// is sharing something they would not expect to be stored.
// ============================================================================

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountUp } from "@/components/count-up";
import { Section } from "@/components/spec-sheet";
import { CABLE_RATES_AS_OF, type EnrichedBOMResult } from "../costEngine";
import {
  auditQuote,
  fairCeiling,
  MARKUP_ALERT_THRESHOLD,
  spendSplit,
  type AuditResult,
  type SpendSlice,
} from "../marketAudit";

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function pct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Darkest for the largest spend. Greys only — the bar is a proportion, not
    a status, so it gets no signal colour. */
const SLICE_TONE: Record<SpendSlice["key"], string> = {
  cable: "bg-slate-800",
  protection: "bg-slate-500",
  conduit: "bg-slate-300",
  accessories: "bg-slate-200",
};

// ---------------------------------------------------------------------------
// Row 1 — the math
// ---------------------------------------------------------------------------

function Figure({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  // A row on phones (label left, figure right), a column cell from sm up.
  // Three side-by-side cells at 360px squeezed the labels to "REFERENCE P…".
  return (
    <div
      className={`flex min-w-0 items-baseline justify-between gap-3 px-3 py-2 sm:block ${className}`}
    >
      <p className="spec-label sm:truncate">{label}</p>
      <p className="spec-num text-base font-semibold leading-tight sm:mt-0.5">{children}</p>
    </div>
  );
}

function TheMath({ totalMrp, reference }: { totalMrp: number; reference: number }) {
  return (
    <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Figure label="MRP (est.)" className="text-slate-500">
        <CountUp value={totalMrp} format={formatINR} />
      </Figure>
      <Figure label="Reference price" className="text-slate-900">
        <CountUp value={reference} format={formatINR} />
      </Figure>
      <Figure label="Fair ceiling" className="bg-slate-50 text-slate-900">
        <CountUp value={fairCeiling(reference)} format={formatINR} />
        <span className="ml-1 text-[11px] font-medium text-slate-500">
          +{pct(MARKUP_ALERT_THRESHOLD)}
        </span>
      </Figure>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row 2 — the split
// ---------------------------------------------------------------------------

function TheSplit({ slices }: { slices: SpendSlice[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200 px-3 py-2">
      <div
        className="flex h-2 min-w-32 flex-1 overflow-hidden bg-slate-100"
        role="img"
        aria-label={`Spend split: ${slices.map((s) => `${s.label} ${pct(s.share)}`).join(", ")}`}
      >
        {slices.map((s) =>
          s.share > 0 ? (
            <div
              key={s.key}
              className={`${SLICE_TONE[s.key]} h-full border-r border-white last:border-r-0`}
              style={{ width: `${s.share * 100}%` }}
            />
          ) : null
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600" aria-hidden="true">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-1 whitespace-nowrap">
            <span className={`size-2 ${SLICE_TONE[s.key]}`} />
            {s.label}
            <span className="spec-num font-semibold text-slate-900">{pct(s.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row 3 — the audit
// ---------------------------------------------------------------------------

function verdictLine(audit: AuditResult): { text: string; tone: string } {
  const over = pct(Math.abs(audit.markupPct), 1);

  const above = formatINR(audit.aboveCeiling);

  switch (audit.verdict) {
    case "ABOVE_RETAIL":
      return {
        text: `${above} above the fair ceiling · at or above MRP, no discount passed on`,
        tone: "border-red-200 bg-red-50 text-red-800",
      };
    case "HIGH":
      return {
        text: `${above} above the fair ceiling · +${over} over reference`,
        tone: "border-amber-300 bg-amber-50 text-amber-800",
      };
    case "FAIR":
      return {
        text: `+${over} over reference · within the fair ceiling`,
        tone: "border-slate-200 bg-slate-50 text-slate-700",
      };
    case "BELOW_REFERENCE":
      return {
        text: `−${over} under reference · check brand, grade and quantities match`,
        tone: "border-slate-200 bg-slate-50 text-slate-700",
      };
  }
}

function TheAudit({ reference, totalMrp }: { reference: number; totalMrp: number }) {
  const inputId = useId();
  const [raw, setRaw] = useState("");
  const [checked, setChecked] = useState<AuditResult | null>(null);
  const verdict = checked ? verdictLine(checked) : null;

  return (
    <form
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-slate-200 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        setChecked(auditQuote(Number(raw), reference, totalMrp));
      }}
    >
      <label htmlFor={inputId} className="spec-label mr-1">
        Audit a quote
      </label>
      <div className="relative w-36">
        <span className="spec-num pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          ₹
        </span>
        <Input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          placeholder="Material price"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            // A verdict must never sit next to a number it was not computed
            // from, so editing clears it until the next Check.
            setChecked(null);
          }}
          className="spec-num h-8 pl-5 text-xs"
        />
      </div>
      <Button type="submit" variant="outline" size="sm" className="h-8 px-3 text-xs">
        Check
      </Button>
      <div aria-live="polite" className="min-w-0">
        {verdict && (
          <p className={`spec-num border px-2 py-1 text-xs leading-snug ${verdict.tone}`}>
            {verdict.text}
          </p>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pane
// ---------------------------------------------------------------------------

export function MarketAuditPane({ pricing }: { pricing: EnrichedBOMResult["pricing"] }) {
  const reference = pricing.wholesaleTradeEstimate;
  if (reference <= 0) return null;

  return (
    <Section title="Market Audit" meta={`Materials only · Cable rates ${CABLE_RATES_AS_OF}`}>
      <TheMath totalMrp={pricing.totalMrp} reference={reference} />
      <TheSplit slices={spendSplit(pricing)} />
      <TheAudit reference={reference} totalMrp={pricing.totalMrp} />
    </Section>
  );
}
