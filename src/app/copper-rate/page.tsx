import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/phase";
import { CABLE_RATES_AS_OF } from "@/features/calculator/costEngine";
import { getCopperRateHistory } from "@/features/market/copperRate";
import {
  formatReadingDate,
  formatRupees,
  PARITY_SOURCE,
  sourceLabel,
  type CopperReading,
} from "@/features/market/format";

export const metadata: Metadata = {
  title: "Copper Rate",
  description:
    "The copper reference rate Phasr records, in ₹ per kg, and why cable prices follow it.",
};

// ---------------------------------------------------------------------------
// Copper rate
// ---------------------------------------------------------------------------
// The latest PriceSnapshot, large, with where it came from, then the recent
// readings. It says plainly how the rate is made (the daily COMEX parity
// cron, or by hand on /admin) and that estimates do not move with it yet: a
// rate that looks live and wired into pricing would be a claim the product
// cannot back.
// ---------------------------------------------------------------------------

/** Where the figure came from, in a sentence or two. */
function provenance(source: string): string {
  if (source === PARITY_SOURCE) {
    // COMEX only, so the copy does not claim LME: the cron never reads it.
    return "Derived from the global COMEX copper benchmark, converted at the latest USD/INR reference rate and adjusted for Indian market parity. A daily reference rate, not a live feed. 18% GST applies separately at final invoicing.";
  }
  const from = source === "MCX" || source === "LME" ? ` from the day's ${source} copper price` : "";
  return `Entered by the Phasr team${from}. It is a reference rate, not a live feed.`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">{children}</h2>;
}

function RateCard({ reading }: { reading: CopperReading }) {
  return (
    <div className="border-2 border-ink">
      <div className="bg-phase-yellow px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink">Reference rate</p>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="font-display text-6xl font-extrabold leading-none tracking-[-0.03em] text-ink tabular-nums">
            {formatRupees(reading.rate)}
          </span>
          <span className="text-lg font-medium text-neutral-800">/kg</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t-2 border-ink px-5 py-2.5 font-mono text-xs text-neutral-700">
        <span>Recorded {formatReadingDate(reading.effectiveDate)}</span>
        <span>Source: {sourceLabel(reading.source)}</span>
      </div>
    </div>
  );
}

export default async function CopperRatePage() {
  const history = await getCopperRateHistory(8);
  const latest = history[0] ?? null;

  return (
    <main className="w-full bg-white">
      <div className="landing-enter mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        <div>
          <Eyebrow phase="red">Market</Eyebrow>
          <h1 className="mt-3 font-display text-5xl font-extrabold leading-none tracking-[-0.03em] text-ink">
            Copper Rate
          </h1>
        </div>

        <div className="mt-8">
          {latest ? (
            <>
              <RateCard reading={latest} />
              <p className="mt-3 text-[13px] leading-relaxed text-neutral-600">
                {provenance(latest.source)}
              </p>
            </>
          ) : (
            <p className="border-2 border-dashed border-neutral-300 px-5 py-6 text-[15px] text-neutral-600">
              No copper rate has been recorded yet. Check back soon.
            </p>
          )}
        </div>

        <div className="mt-10 space-y-8">
          <section>
            <SectionTitle>Why it matters</SectionTitle>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-700">
              Copper is the main raw material in house wire, so cable prices follow it. Cable is
              one of the biggest lines in any wiring estimate.
            </p>
          </section>

          <section>
            <SectionTitle>In your estimate</SectionTitle>
            <div className="mt-3 flex items-center justify-between gap-4 border border-neutral-300 px-4 py-3">
              <span>
                <span className="block text-[15px] font-semibold text-ink">Cable rates</span>
                <span className="block text-[13px] text-neutral-600">Checked against printed MRPs</span>
              </span>
              <span className="font-mono text-sm font-semibold text-ink">{CABLE_RATES_AS_OF}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
              Estimates do not move with the copper rate yet. Cable prices come from the{" "}
              {CABLE_RATES_AS_OF} check.
            </p>
          </section>

          {history.length > 0 && (
            <section>
              <SectionTitle>Recorded rates</SectionTitle>
              <table className="mt-3 w-full border-y border-neutral-300 font-mono text-[13px]">
                <caption className="sr-only">Recent copper rates, newest first</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Source</th>
                    <th scope="col">Rate per kg</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((reading) => (
                    <tr key={reading.effectiveDate} className="border-b border-neutral-200 last:border-b-0">
                      <td className="py-2.5 text-ink">{formatReadingDate(reading.effectiveDate)}</td>
                      <td className="py-2.5 text-neutral-600">{sourceLabel(reading.source)}</td>
                      <td className="py-2.5 text-right font-semibold text-ink tabular-nums">
                        {formatRupees(reading.rate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>

        <Button asChild size="lg" className="mt-10 h-12 w-full text-[15px] font-semibold sm:w-auto">
          <Link href="/calculator">
            Start an estimate
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </main>
  );
}
