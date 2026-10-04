"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Calculator,
  ChartLine,
  Info,
  LayoutDashboard,
  Loader2,
  Menu,
  MessageCircle,
  ScanLine,
  Shield,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavigationProgress } from "@/components/navigation-progress";
import { ComingSoonBadge, PhaseStripe, PhaseSwatch, type Phase } from "@/components/phase";
import { formatReadingDay, formatRupees, type CopperReading } from "@/features/market/format";
import { WHATSAPP_PARTNER_URL } from "@/lib/contact";
import { useNavigationPhase } from "@/lib/navigation-progress";

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------
// An ink bar under the R·Y·B stripe. ☰ at the top left opens a drawer of
// links grouped as Market, Network and Roadmap, so the menu shows Phasr
// is tied to real prices and real dealers, not only a calculator. On a phone
// the bar itself keeps one link (Dashboard, or Sign In) so the hamburger,
// the wordmark and that link fit at 360px. From sm up the main links also
// show inline.
//
// copperRate comes from the root layout, cached; null hides the figure.
//
// While a page loads after a link is tapped, a yellow bar runs along the
// bar's bottom edge and a spinner turns beside the wordmark
// (components/navigation-progress.tsx), so nobody taps three times.
// ---------------------------------------------------------------------------

/** No display value here: each link adds inline-flex, or hidden sm:inline-flex.
    Both in one class list and inline-flex wins, showing phone-hidden links. */
const BAR_LINK =
  "h-8 items-center rounded-md px-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20";

function MenuLink({
  href,
  icon: Icon,
  external = false,
  strong = false,
  children,
  trailing,
}: {
  href: string;
  icon: LucideIcon;
  external?: boolean;
  strong?: boolean;
  children: React.ReactNode;
  /** Right-hand detail: the copper figure, a badge, "WhatsApp ↗". */
  trailing?: React.ReactNode;
}) {
  const className = `flex min-h-11 items-center gap-3 px-3 py-1.5 text-[15px] text-ink transition-colors hover:bg-neutral-100 active:bg-neutral-200 ${
    strong ? "font-semibold" : ""
  }`;
  const body = (
    <>
      <Icon aria-hidden="true" className={`size-[18px] shrink-0 ${strong ? "text-ink" : "text-neutral-500"}`} />
      <span className="min-w-0">{children}</span>
      {trailing}
    </>
  );

  return (
    <SheetClose asChild>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
          {body}
        </a>
      ) : (
        <Link href={href} className={className}>
          {body}
        </Link>
      )}
    </SheetClose>
  );
}

function MenuSection({
  id,
  label,
  phase,
  children,
}: {
  id: string;
  label: string;
  phase: Phase;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-labelledby={id} className="mt-4">
      <p
        id={id}
        className="mb-1 flex items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-neutral-600"
      >
        <PhaseSwatch phase={phase} />
        {label}
      </p>
      {children}
    </div>
  );
}

export function Navbar({ copperRate }: { copperRate: CopperReading | null }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const isAuthed = status === "authenticated";
  const isDealer = role === "DEALER";
  const navigating = useNavigationPhase() === "loading";

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-ink text-white">
      <PhaseStripe />
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-1">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2.5 text-white hover:bg-white/10 hover:text-white"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>

            {/* aria-describedby={undefined}: a drawer of links has nothing to
                describe, and this is how Radix is told so without a warning.
                Own close button: the built-in one is a 16px target. */}
            <SheetContent
              side="left"
              showCloseButton={false}
              aria-describedby={undefined}
              className="w-80 max-w-[85vw] gap-0 overflow-y-auto border-r-0 bg-white p-0 shadow-none"
            >
              <PhaseStripe />
              <SheetHeader className="flex-row items-center justify-between gap-2 border-b-2 border-ink py-2 pl-5 pr-2">
                <SheetTitle className="font-display text-2xl font-extrabold tracking-tight text-ink">
                  phasr
                </SheetTitle>
                <SheetClose asChild>
                  <Button variant="ghost" size="icon-lg" className="text-ink" aria-label="Close menu">
                    <X className="size-5" />
                  </Button>
                </SheetClose>
              </SheetHeader>

              <nav aria-label="Main" className="flex-1 px-2 pb-2 pt-2">
                {!isDealer && (
                  <MenuLink href="/calculator" icon={Calculator} strong>
                    Calculator
                  </MenuLink>
                )}
                {isAuthed && (
                  <MenuLink href="/dashboard" icon={LayoutDashboard}>
                    Dashboard
                  </MenuLink>
                )}
                {isAuthed && role === "ADMIN" && (
                  <MenuLink href="/admin" icon={Shield}>
                    Admin
                  </MenuLink>
                )}
                <MenuLink href="/about" icon={Info}>
                  About
                </MenuLink>

                <MenuSection id="menu-market" label="Market" phase="red">
                  <MenuLink
                    href="/copper-rate"
                    icon={ChartLine}
                    trailing={
                      copperRate && (
                        <span className="ml-auto flex flex-col items-end leading-tight">
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {formatRupees(copperRate.rate)}/kg
                          </span>
                          <span className="text-[11px] text-neutral-600">
                            {formatReadingDay(copperRate.effectiveDate)}
                          </span>
                        </span>
                      )
                    }
                  >
                    Copper Rate
                  </MenuLink>
                </MenuSection>

                <MenuSection id="menu-network" label="Network" phase="yellow">
                  <MenuLink href="/distributors" icon={ShieldCheck}>
                    Verified Distributors
                  </MenuLink>
                  {WHATSAPP_PARTNER_URL && (
                    <MenuLink
                      href={WHATSAPP_PARTNER_URL}
                      icon={MessageCircle}
                      external
                      trailing={
                        <span className="ml-auto flex items-center gap-1 text-xs text-neutral-600">
                          WhatsApp
                          <ArrowUpRight aria-hidden="true" className="size-3" />
                        </span>
                      }
                    >
                      Partner with Us
                    </MenuLink>
                  )}
                </MenuSection>

                <MenuSection id="menu-roadmap" label="Roadmap" phase="blue">
                  <MenuLink href="/snap-to-bom" icon={ScanLine} trailing={<ComingSoonBadge />}>
                    Snap-to-BOM
                  </MenuLink>
                </MenuSection>
              </nav>

              {isAuthed && (
                <div className="border-t border-neutral-200 px-5 py-4">
                  <SheetClose asChild>
                    <Button
                      variant="outline"
                      className="h-11 w-full border-2 border-ink text-ink shadow-none"
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </Button>
                  </SheetClose>
                </div>
              )}
              {status === "unauthenticated" && (
                <div className="flex gap-2 border-t border-neutral-200 px-5 py-4">
                  <SheetClose asChild>
                    <Button variant="outline" className="h-11 flex-1 border-2 border-ink text-ink shadow-none" asChild>
                      <Link href="/login">Sign In</Link>
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button className="h-11 flex-1 font-semibold" asChild>
                      <Link href="/register">Create account</Link>
                    </Button>
                  </SheetClose>
                </div>
              )}

              <p className="px-5 pb-4 text-xs text-neutral-600">
                <SheetClose asChild>
                  <Link href="/privacy" className="hover:text-ink">
                    Privacy
                  </Link>
                </SheetClose>
                {" · "}
                <SheetClose asChild>
                  <Link href="/terms" className="hover:text-ink">
                    Terms
                  </Link>
                </SheetClose>
              </p>
            </SheetContent>
          </Sheet>

          <Link href="/" className="font-display text-xl font-extrabold tracking-tight text-white">
            phasr
          </Link>
          {/* Always mounted, so showing it never shifts the bar's layout. */}
          <Loader2
            aria-hidden="true"
            className={`ml-1 size-4 text-phase-yellow transition-opacity duration-150 motion-safe:animate-spin ${
              navigating ? "opacity-100" : "opacity-0"
            }`}
          />
          <span role="status" className="sr-only">
            {navigating ? "Loading page" : ""}
          </span>
        </div>

        <nav aria-label="Account" className="flex items-center gap-1">
          {/* From sm up: the calculator is the product, not a member
              feature. Dealers are the exception — they quote, they do not
              create estimates. Below sm it lives in the drawer. */}
          {!isDealer && (
            <Link href="/calculator" className={`${BAR_LINK} hidden sm:inline-flex`}>
              Calculator
            </Link>
          )}

          {isAuthed && (
            <>
              {role === "ADMIN" && (
                <Link href="/admin" className={`${BAR_LINK} hidden sm:inline-flex`}>
                  Admin
                </Link>
              )}
              <Link href="/dashboard" className={`${BAR_LINK} inline-flex`}>
                Dashboard
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className={`${BAR_LINK} hidden border border-white/30 sm:ml-1 sm:inline-flex`}
              >
                Sign Out
              </button>
            </>
          )}
          {status === "unauthenticated" && (
            <Link href="/login" className={`${BAR_LINK} inline-flex`}>
              Sign In
            </Link>
          )}
        </nav>
      </div>

      {/* Suspense: it reads the query string, which a statically rendered
          page would otherwise have to wait for. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
    </header>
  );
}
