import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/auth";

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
// A headline, one plain-English sentence, and two doors — centred, nothing
// else. What the product does lives on /about, linked from the navbar's ☰
// menu; on this page it was a list a first-time visitor had to read past to
// reach the buttons.
//
// The dealer path does not get a competing headline: there is one product
// here, and a second hero would argue with the first. 1px rules, no fills.
// ---------------------------------------------------------------------------

/** Small-caps eyebrow, matching the .spec-label treatment used on the data
    screens without inheriting its colour. */
function Eyebrow({
  children,
  className = "text-slate-500",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[11px] font-medium uppercase leading-none tracking-[0.18em] ${className}`}
    >
      {children}
    </p>
  );
}

/**
 * One door into the product.
 *
 * A bordered block rather than a card: no shadow, no fill, no radius beyond
 * the global 0.25rem. The hover state moves the border, not the box — a lift
 * on a landing page is decoration that a procurement tool does not need.
 */
function EntryPane({
  href,
  audience,
  action,
  note,
}: {
  href: string;
  audience: string;
  action: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="group block border border-slate-200 bg-white px-5 py-4 transition-colors duration-150 ease-out hover:border-slate-400"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow className="text-slate-400">{audience}</Eyebrow>
          <p className="mt-2 text-[15px] font-semibold text-slate-900">
            {action}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            {note}
          </p>
        </div>
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-slate-300 transition-[transform,color] duration-150 ease-out group-hover:translate-x-1 group-hover:text-slate-900" />
      </div>
    </Link>
  );
}

export default async function Home() {
  const session = await auth();
  const isDealer = session?.user?.role === "DEALER";
  const isBuyer = !!session?.user && !isDealer;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] w-full bg-slate-50">
      {/* landing-enter: headline, then the two doors 100ms behind, then the
          sign-in line. Plain CSS, so it runs from first paint — no
          JavaScript to wait for before the page is visible. */}
      <div className="landing-enter mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-16 text-center sm:px-6 md:py-28">
        <div>
          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-slate-950 sm:text-5xl">
            Plan the Build.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-slate-600">
            Find out exactly what wiring your home needs, then get prices from
            verified dealers in Delhi NCR.
          </p>
        </div>

        <div className="mt-10 grid w-full gap-3 text-left md:grid-cols-2">
          <EntryPane
            href="/calculator"
            audience="Homeowners & Builders"
            action={isBuyer ? "New Estimate" : "Calculate Your Estimate"}
            note={
              isBuyer
                ? "Start a fresh estimate for another property."
                : "Free, and no account needed."
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

        <p className="mt-6 text-[13px] text-slate-500">
          {isBuyer ? (
            <>
              Your{" "}
              <Link
                href="/dashboard"
                className="font-medium text-slate-900 underline-offset-4 hover:underline"
              >
                saved projects
              </Link>{" "}
              are on the dashboard.
            </>
          ) : session?.user ? (
            <>Signed in as a dealer.</>
          ) : (
            <>
              Already registered?{" "}
              <Link
                href="/login"
                className="font-medium text-slate-900 underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
              {" · "}
              <Link
                href="/dashboard?demo=true"
                className="font-medium text-slate-900 underline-offset-4 hover:underline"
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
