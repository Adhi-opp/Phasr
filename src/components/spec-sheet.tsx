// src/components/spec-sheet.tsx
// ============================================================================
// DRAWING-SHEET PRIMITIVES
// ============================================================================
// The shared visual language for every data surface in VoltFlow: numbered
// sections with a ruled header, metric strips, and dense tables with tabular
// figures. Density over decoration — 1px rules, tight padding, no shadows, no
// pill radii.
//
// Section headers recede (small, tracked, slate-500) so the figures under
// them are the darkest thing on the sheet.
//
// These started as local helpers inside BOMResultView. They live here now so
// the buyer's BOM sheet, the dealer's requisition and the dealer board cannot
// drift into three dialects of the same idea.
//
// Slate rather than zinc, deliberately. Visually the two ramps are almost
// identical at these weights, but slate is what the navbar, the project
// register and the quote matrix already use, and a platform that changes hue
// between the buyer and dealer halves is exactly the inconsistency this
// module exists to prevent. Swapping the whole app to zinc is a find/replace
// away if that is the call — but it should be all of it, not half.
// ============================================================================

/** Ruled section container. Numbered when it is part of a schedule; an
    analysis block that sits alongside one (the market audit) leaves index off
    so it does not renumber the schedule around it. */
export function Section({
  index,
  title,
  meta,
  children,
}: {
  index?: number;
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white">
      {/* flex-wrap + a no-wrap title: on a phone a long meta drops to its own
          line instead of breaking the title ("MARKET / AUDIT") beside it. */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <h3 className="flex items-baseline gap-2 whitespace-nowrap">
          {index != null && (
            <span className="spec-num text-[11px] text-slate-400">
              {String(index).padStart(2, "0")}
            </span>
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {title}
          </span>
        </h3>
        {meta && <span className="spec-label">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

/** A single figure in a metric strip. Cells rule against each other. */
export function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  /** A string, or a <CountUp> for a headline figure. */
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="border-r border-slate-200 px-3 py-2.5 last:border-r-0">
      <p className="spec-label">{label}</p>
      <p
        className={`spec-num mt-1 text-lg font-semibold leading-tight ${
          accent ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Inline style for a `.spec-table`. Below 48rem the stylesheet turns each row
 * into a stacked card — one line per column, its header printed beside the
 * value — so a phone never scrolls sideways. The headers reach the stylesheet
 * as CSS strings (--spec-col-1 … --spec-col-8); no row markup changes, which
 * is what lets this work for rows rendered by a nested component, such as
 * the board schedule's ways. The minimum width only applies at 48rem and up.
 */
export function specTableStyle(head: string[], minWidth: number): React.CSSProperties {
  const style: Record<string, string> = { "--spec-min-w": `${minWidth}px` };
  head.slice(0, 8).forEach((h, i) => {
    style[`--spec-col-${i + 1}`] = JSON.stringify(h);
  });
  return style as React.CSSProperties;
}

/**
 * Dense table. First column left-aligned, the rest right-aligned, because
 * everything after the identifier is a quantity that should line up. On a
 * phone each row stacks into a card instead; see specTableStyle.
 */
export function SpecTable({
  head,
  minWidth = 520,
  children,
}: {
  head: string[];
  minWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className="spec-table w-full text-[13px]"
        style={specTableStyle(head, minWidth)}
      >
        <thead>
          <tr className="border-b border-slate-200 bg-white">
            {head.map((h, i) => (
              <th
                key={h}
                className={`spec-label whitespace-nowrap px-3 py-2 font-medium ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
      {children}
    </tr>
  );
}

/**
 * Label/value pair for reference data that is read, not compared — a GSTIN,
 * an address, a reference number. Not for quantities; those belong in a
 * SpecTable where they can line up in a column.
 */
export function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="border-b border-slate-100 px-3 py-2 last:border-b-0">
      <p className="spec-label">{label}</p>
      <p
        className={`mt-0.5 text-[13px] leading-snug text-slate-900 ${
          mono ? "spec-num" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** Square status chip. Uppercase, bordered, never a rounded pill. */
export function StatusChip({
  status,
  tone = "neutral",
}: {
  status: string;
  tone?: "neutral" | "good" | "warn" | "bad" | "muted";
}) {
  const styles: Record<string, string> = {
    neutral: "border-slate-300 bg-white text-slate-600",
    good: "border-emerald-300 bg-emerald-50 text-emerald-700",
    warn: "border-amber-300 bg-amber-50 text-amber-700",
    bad: "border-destructive/40 bg-destructive/10 text-destructive",
    muted: "border-slate-200 bg-slate-50 text-slate-400",
  };

  return (
    <span
      className={`inline-block whitespace-nowrap border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${styles[tone]}`}
    >
      {status}
    </span>
  );
}

/** Maps the RFQ / quote status vocabulary onto chip tones. */
export function statusTone(
  status: string
): "neutral" | "good" | "warn" | "bad" | "muted" {
  switch (status) {
    case "ACCEPTED":
    case "APPROVED":
    case "OPEN":
      return "good";
    case "PENDING":
    case "DRAFT":
      return "warn";
    case "REJECTED":
    case "EXPIRED":
      return "bad";
    case "CLOSED":
      return "muted";
    default:
      return "neutral";
  }
}
