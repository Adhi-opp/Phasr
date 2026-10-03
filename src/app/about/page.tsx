import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description:
    "VoltFlow calculates your property's exact wiring requirements in line with IS 732, then connects you with verified Delhi NCR distributors for competing wholesale quotes.",
};

// ---------------------------------------------------------------------------
// About page
// ---------------------------------------------------------------------------
// What VoltFlow does, moved out of the ☰ menu, where a paragraph turned the
// drawer into a wall of text on a phone. The same two ideas (plan the
// wiring, then source it) are split into a headline, a lead, and the second
// step set apart on a card.
//
// Each block fades up in turn. CSS only (tw-animate-css), so it runs from
// first paint with no JavaScript, and every class is motion-safe: so anyone
// who has asked for reduced motion gets the page standing still.
// ---------------------------------------------------------------------------

/** The shared enter animation. fill-mode-both keeps a delayed block hidden
    until its turn, instead of showing it at full opacity and then snapping
    it back to fade in. */
const ENTER =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700 motion-safe:ease-out motion-safe:fill-mode-both";

export default function AboutPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] w-full bg-slate-50">
      <div className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 md:py-24">
        <h1
          className={`${ENTER} text-balance text-4xl font-bold leading-[1.05] tracking-tight text-slate-950 sm:text-5xl`}
        >
          Smarter Electrical Planning for Delhi&nbsp;NCR.
        </h1>

        <p
          className={`${ENTER} motion-safe:delay-150 mt-5 max-w-2xl text-[15px] leading-7 text-slate-600 sm:text-base sm:leading-7`}
        >
          VoltFlow automatically calculates your property&apos;s exact wiring
          requirements, including load distribution, circuit schedules, and
          cable lengths aligned with IS&nbsp;732 standards.
        </p>

        {/* The divider rides with the card so the two arrive together. */}
        <div className={`${ENTER} motion-safe:delay-300 mt-10 border-t border-slate-200 pt-10`}>
          <p className="border border-slate-200 bg-white px-5 py-5 text-[15px] leading-7 text-slate-900 sm:px-6 sm:text-base sm:leading-7">
            Once your electrical plan is generated, the platform connects you
            directly with verified local distributors to source competitive
            wholesale quotes, ensuring you get the right materials at the best
            market price.
          </p>
        </div>

        <div className={`${ENTER} motion-safe:delay-450 mt-10`}>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/calculator">
              Start New Estimate
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
