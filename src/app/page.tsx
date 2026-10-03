import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, ScanLine } from "lucide-react";
import { auth } from "@/auth";
import { ComingSoonBadge, Eyebrow } from "@/components/phase";

export const metadata: Metadata = {
  // absolute: the brand alone, bypassing the "%s | VoltFlow" template that
  // would otherwise make it "VoltFlow | VoltFlow".
  title: { absolute: "VoltFlow" },
  description:
    "Generate an engineer-grade electrical BOM for your build, or quote verified requirements from ready-to-buy contractors in your service area. Aligned with IS 732 standard practice, for NCR.",
  openGraph: {
    title: "VoltFlow",
    description:
      "Free IS 732-aligned BOM calculator plus competing wholesale quotes from verified local dealers.",
  },
};

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------
// Phase R·Y·B. Top to bottom:
//   1. Yellow hero — the headline and one plain-English sentence.
//   2. Two doors — homeowners (ink, the primary path) and dealers.
//   3. Snap-to-BOM teaser — the roadmap, marked Coming soon.
//
// The copper rate lives in the ☰ menu and on /copper-rate, not here: the
// landing page has one job, getting a visitor into an estimate.
//
// The dealer path does not get a competing headline: there is one product
// here, and a second hero would argue with the first.
// ---------------------------------------------------------------------------

/** One door into the product. The primary door is ink; the other is outlined. */
function EntryPane({
  href,
  audience,
  action,
  note,
  primary = false,
}: {
  href: string;
  audience: string;
  action: string;
  note: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between gap-4 px-5 py-5 transition-colors duration-150 ${
        primary
          ? "bg-ink text-white hover:bg-neutral-800"
          : "border-2 border-ink bg-white text-ink hover:bg-neutral-50"
      }`}
    >
      <span className="min-w-0">
        <span
          className={`block text-[10px] font-bold uppercase tracking-[0.18em] ${
            primary ? "text-white/70" : "text-neutral-600"
          }`}
        >
          {audience}
        </span>
        <span className="mt-1.5 block font-display text-[22px] font-extrabold leading-tight tracking-tight">
          {action}
        </span>
        <span className={`mt-1 block text-[13px] leading-relaxed ${primary ? "text-white/70" : "text-neutral-600"}`}>
          {note}
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        strokeWidth={2.4}
        className={`size-5 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-1 ${
          primary ? "text-phase-yellow" : "text-ink"
        }`}
      />
    </Link>
  );
}

function SnapTeaser() {
  return (
    <Link
      href="/snap-to-bom"
      className="group flex items-center gap-4 border border-neutral-300 bg-white px-4 py-3.5 transition-colors duration-150 hover:border-ink"
    >
      <span className="flex size-10 shrink-0 items-center justify-center bg-phase-blue text-white">
        <ScanLine aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[15px] font-bold text-ink">Snap-to-BOM</span>
          <ComingSoonBadge />
        </span>
        <span className="mt-0.5 block text-pretty text-[13px] text-neutral-600">
          Snap a floor plan. The estimate fills itself in.
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-neutral-400 transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-ink"
      />
    </Link>
  );
}

export default async function Home() {
  const session = await auth();
  const isDealer = session?.user?.role === "DEALER";
  const isBuyer = !!session?.user && !isDealer;

  return (
    <main className="w-full bg-white">
      <section className="bg-phase-yellow">
        {/* landing-enter: eyebrow, headline, then the sentence, each a beat
            behind. Plain CSS, so it runs from first paint. */}
        <div className="landing-enter mx-auto w-full max-w-5xl px-4 pb-10 pt-12 sm:px-6 md:pb-16 md:pt-20">
          <Eyebrow phase="red" tone="ink">
            Delhi NCR · IS 732-aligned
          </Eyebrow>
          <h1 className="mt-4 font-display text-[3.75rem] font-extrabold leading-[0.92] tracking-[-0.04em] text-ink sm:text-7xl md:text-8xl">
            Plan the Build.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-neutral-800 md:text-lg">
            Find out exactly what wiring your home needs, then get prices from verified
            dealers in Delhi NCR.
          </p>
        </div>
      </section>

      <div className="landing-enter mx-auto w-full max-w-5xl px-4 pb-12 pt-5 sm:px-6 md:pt-8">
        <div className="grid gap-3 md:grid-cols-2">
          <EntryPane
            href="/calculator"
            primary
            audience="Homeowners & Builders"
            action={isBuyer ? "New Estimate" : "Calculate Your Estimate"}
            note={
              isBuyer ? "Start a fresh estimate for another property." : "Free, and no account needed."
            }
          />
          <EntryPane
            href={isDealer ? "/dealer/dashboard" : "/register?role=DEALER"}
            audience="Dealers & Distributors"
            action="Dealer Portal"
            note={
              isDealer
                ? "Open requests in your service area."
                : "Quote verified requirements in your service area."
            }
          />
        </div>

        <div className="mt-3">
          <SnapTeaser />
        </div>

        <p className="mt-6 text-[13px] text-neutral-600">
          {isBuyer ? (
            <>
              Your{" "}
              <Link href="/dashboard" className="font-semibold text-ink underline-offset-4 hover:underline">
                saved projects
              </Link>{" "}
              are on the dashboard.
            </>
          ) : session?.user ? (
            <>Signed in as a dealer.</>
          ) : (
            <>
              Already registered?{" "}
              <Link href="/login" className="font-semibold text-ink underline-offset-4 hover:underline">
                Sign in
              </Link>
              {" · "}
              <Link
                href="/dashboard?demo=true"
                className="font-semibold text-ink underline-offset-4 hover:underline"
              >
                See a sample project
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
