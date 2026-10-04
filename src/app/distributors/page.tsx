import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/phase";
import { WHATSAPP_PARTNER_URL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "Verified Distributors",
  description:
    "How Phasr verifies the electrical distributors who quote on it, across Delhi NCR.",
};

// ---------------------------------------------------------------------------
// Verified distributors
// ---------------------------------------------------------------------------
// The network as it really is: onboarding, with the checks every dealer goes
// through. No dealer count and no brand logos until both are worth showing.
// Each step is enforced in code, and the copy says no more than the code:
//   1. A company name is required; GSTIN is optional but format-checked
//      (dealer/actions.ts). Optional by decision: many NCR sub-dealers are
//      on the GST composition scheme or below the threshold, and a required
//      GSTIN would turn them away. So the copy never says "and GSTIN".
//   2. Only APPROVED dealers can submit a quote (quotes/actions.ts).
//   3. Changing the company name or GSTIN sets the profile back to PENDING.
// ---------------------------------------------------------------------------

const AREAS = ["Delhi", "Gurugram", "Noida", "Faridabad", "Ghaziabad"];

const STEPS = [
  {
    title: "Registration",
    body: "Every distributor registers their company name. A GSTIN, when given, must be a valid 15-character number.",
  },
  {
    title: "Phasr review",
    body: "We check the profile before they can send a single quote.",
  },
  {
    title: "Re-review on change",
    body: "If the company name or GSTIN changes, the profile goes back for review.",
  },
];

export default function DistributorsPage() {
  return (
    <main className="w-full bg-white">
      <div className="landing-enter mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        <div>
          <Eyebrow phase="yellow">Verified Distributors</Eyebrow>
          <h1 className="mt-3 text-balance font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.03em] text-ink sm:text-5xl">
            Now onboarding distributors across Delhi&nbsp;NCR.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-700">
            Every dealer who quotes on Phasr is checked first.
          </p>
        </div>

        <div>
          <p className="mt-8 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-600">
            Onboarding in
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {AREAS.map((area) => (
              <li key={area} className="border border-neutral-300 px-3 py-1.5 text-[13px] text-ink">
                {area}
              </li>
            ))}
          </ul>
        </div>

        <section className="mt-10">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">
            How verification works
          </h2>
          <ol className="mt-3 border-t border-neutral-300">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 border-b border-neutral-300 py-4">
                <span className="flex size-7 shrink-0 items-center justify-center bg-ink font-mono text-xs font-semibold text-phase-yellow">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{step.title}</span>
                  <span className="mt-0.5 block text-[14px] leading-relaxed text-neutral-600">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 flex gap-4 border-2 border-ink bg-phase-yellow px-5 py-4">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink" />
          <p>
            <span className="block text-[15px] font-bold text-ink">
              Your number stays private until you accept a quote.
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-neutral-800">
              Contact details are shared with both sides only once a quote is accepted.
            </span>
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 text-[15px] font-semibold">
            <Link href="/register?role=DEALER">Apply as a distributor</Link>
          </Button>
          {WHATSAPP_PARTNER_URL && (
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 border-2 border-ink text-[15px] font-semibold text-ink shadow-none"
            >
              <a href={WHATSAPP_PARTNER_URL} target="_blank" rel="noopener noreferrer">
                <MessageCircle aria-hidden="true" />
                Partner with Us on WhatsApp
              </a>
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
