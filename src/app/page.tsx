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
// One surface, one background. The page states what the product does once,
// then offers two doors into it — the dealer path does not get a competing
// headline, because there is only one product here and a second hero was
// arguing with the first.
//
// Everything is separated by 1px rules rather than by colour blocks. The
// borders carry the structure; nothing needs a filled panel to be legible.
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
      className="group block border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400"
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
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-900" />
      </div>
    </Link>
  );
}

/** Hairline list of what the product actually produces. Every line is backed
    by a field the calculator already computes. */
function SpecList({ items }: { items: string[] }) {
  return (
    <ul className="mt-8 border-t border-slate-200 text-[13px] text-slate-600">
      {items.map((item) => (
        <li key={item} className="border-b border-slate-200 py-2.5 leading-snug">
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  const session = await auth();
  const isDealer = session?.user?.role === "DEALER";
  const isBuyer = !!session?.user && !isDealer;

  return (
    <main className="min-h-[calc(100vh-3.5rem)] w-full bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 md:py-24">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-start md:gap-14">
          {/* ── Left: the two doors ──────────────────────────────────────
              order-last on mobile so a first-time visitor reads what this
              is before being asked to choose a path. On desktop the grid
              puts it back in column one. */}
          <div className="order-last flex flex-col gap-3 md:order-none">
            <EntryPane
              href="/calculator"
              audience="Homeowners & Builders"
              action={isBuyer ? "New Estimate" : "Calculate Your Estimate"}
              note={
                isBuyer
                  ? "Start a fresh BOM for another property."
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

            <p className="mt-2 text-[13px] text-slate-500">
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

          {/* ── Right: what this is ─────────────────────────────────────── */}
          <div className="order-first md:order-none">
            <Eyebrow>Residential electrical estimation &middot; Delhi NCR</Eyebrow>

            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-slate-950 sm:text-5xl">
              Plan the Build.
            </h1>

            <p className="mt-4 max-w-md text-[15px] leading-7 text-slate-600">
              Generate an engineer-grade electrical BOM and source wholesale
              quotes.
            </p>

            <SpecList
              items={[
                "Circuit schedule with MCB ratings and phase recommendation",
                "Cable lengths rounded to purchasable coils, by gauge",
                "Connected load and diversified maximum demand",
              ]}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
