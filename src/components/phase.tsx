// src/components/phase.tsx
// ============================================================================
// PHASE R·Y·B BRAND PIECES
// ============================================================================
// Red, yellow and blue are the Indian three-phase colour code. Every
// electrician knows them, so they are the brand's only accents: the stripe
// over the navbar, a swatch beside each section label, the yellow of primary
// actions. The colours are decoration, never the only signal; every swatch
// sits next to a word.
// ============================================================================

/** The three phases side by side. Sits above the navbar and the drawer. */
export function PhaseStripe({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex h-1 ${className}`}>
      <span className="flex-1 bg-phase-red" />
      <span className="flex-1 bg-phase-yellow" />
      <span className="flex-1 bg-phase-blue" />
    </div>
  );
}

export type Phase = "red" | "yellow" | "blue";

/** Yellow gets an ink outline, since it disappears on white or yellow. */
const SWATCH: Record<Phase, string> = {
  red: "bg-phase-red",
  yellow: "bg-phase-yellow ring-1 ring-inset ring-ink",
  blue: "bg-phase-blue",
};

export function PhaseSwatch({ phase }: { phase: Phase }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 ${SWATCH[phase]}`} />;
}

/** Small-caps label with its phase swatch: "■ MARKET". */
export function Eyebrow({
  phase,
  tone = "muted",
  className = "",
  children,
}: {
  phase: Phase;
  tone?: "muted" | "ink";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={`flex items-center gap-2 text-[11px] font-bold uppercase leading-none tracking-[0.18em] ${
        tone === "ink" ? "text-ink" : "text-neutral-600"
      } ${className}`}
    >
      <PhaseSwatch phase={phase} />
      {children}
    </p>
  );
}

export function ComingSoonBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-phase-blue px-2 py-0.5 text-[10px] font-bold uppercase leading-4 tracking-[0.06em] text-white">
      Coming soon
    </span>
  );
}
