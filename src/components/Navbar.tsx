"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------
// ☰ at the top left opens a drawer with what VoltFlow is (the About text the
// landing page used to carry as a bullet list) and every link. On a phone
// the bar itself keeps one link — Dashboard, or Sign In — so the hamburger,
// the wordmark and that link fit at 360px; the rest live in the drawer.
// From sm up the full set of links shows inline as before.
// ---------------------------------------------------------------------------

/** What every estimate includes. Each line is backed by a field the
    calculator computes. */
const ABOUT_POINTS = [
  "Circuit schedule with MCB ratings and phase recommendation",
  "Cable lengths rounded to purchasable coils, by gauge",
  "Connected load and diversified maximum demand",
];

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <SheetClose asChild>
      <Link
        href={href}
        className="block px-2 py-2 text-[14px] text-slate-900 transition-colors hover:bg-slate-100"
      >
        {children}
      </Link>
    </SheetClose>
  );
}

export function Navbar() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const isAuthed = status === "authenticated";
  const isDealer = role === "DEALER";

  async function handleSignOut() {
    await signOut({ callbackUrl: "/login" });
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-slate-50/85 backdrop-blur supports-[backdrop-filter]:bg-slate-50/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-1">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-ml-2 text-slate-700"
                aria-label="Open menu and About VoltFlow"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>

            <SheetContent
              side="left"
              className="w-80 max-w-[85vw] gap-0 border-slate-200 bg-slate-50 p-0 shadow-none"
            >
              <SheetHeader className="border-b border-slate-200 px-4 py-4">
                <SheetTitle className="text-lg font-bold tracking-tight text-slate-900">
                  VOLTFLOW
                </SheetTitle>
                <SheetDescription className="text-[13px] leading-relaxed text-slate-600">
                  Find out exactly what wiring a home in Delhi NCR needs — every
                  circuit, breaker and coil of cable — then get prices for it
                  from verified local dealers.
                </SheetDescription>
              </SheetHeader>

              <section aria-labelledby="about-voltflow" className="border-b border-slate-200 px-4 py-4">
                <h2 id="about-voltflow" className="spec-label">
                  About
                </h2>
                <p className="mt-2 text-[13px] text-slate-700">Every estimate includes:</p>
                <ul className="mt-1.5 border-t border-slate-200 text-[13px] text-slate-600">
                  {ABOUT_POINTS.map((point) => (
                    <li key={point} className="border-b border-slate-200 py-2 leading-snug">
                      {point}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-snug text-slate-500">
                  Aligned with IS 732 practice. Estimates only: a licensed
                  electrical contractor verifies the final design.
                </p>
              </section>

              <nav aria-label="Main" className="px-2 py-2">
                {!isDealer && <MenuLink href="/calculator">Calculator</MenuLink>}
                {isAuthed && <MenuLink href="/dashboard">Dashboard</MenuLink>}
                {isAuthed && role === "ADMIN" && <MenuLink href="/admin">Admin</MenuLink>}
                {isAuthed && (
                  <SheetClose asChild>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="block w-full px-2 py-2 text-left text-[14px] text-slate-900 transition-colors hover:bg-slate-100"
                    >
                      Sign Out
                    </button>
                  </SheetClose>
                )}
                {status === "unauthenticated" && (
                  <>
                    <MenuLink href="/login">Sign In</MenuLink>
                    <MenuLink href="/register">Create an account</MenuLink>
                  </>
                )}
              </nav>

              <p className="mt-auto border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                <SheetClose asChild>
                  <Link href="/privacy" className="hover:text-slate-900">
                    Privacy
                  </Link>
                </SheetClose>
                {" · "}
                <SheetClose asChild>
                  <Link href="/terms" className="hover:text-slate-900">
                    Terms
                  </Link>
                </SheetClose>
              </p>
            </SheetContent>
          </Sheet>

          <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
            VOLTFLOW
          </Link>
        </div>

        <nav className="flex items-center gap-2">
          {/* Always reachable from sm up: the calculator is the product, not
              a member feature. Dealers are the exception — they quote, they
              do not create estimates. Below sm it lives in the drawer. */}
          {!isDealer && (
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <Link href="/calculator">Calculator</Link>
            </Button>
          )}

          {isAuthed && (
            <>
              {role === "ADMIN" && (
                <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
                  <Link href="/admin">Admin</Link>
                </Button>
              )}
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </>
          )}
          {status === "unauthenticated" && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
