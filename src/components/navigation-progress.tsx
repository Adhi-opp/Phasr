"use client";

// src/components/navigation-progress.tsx
// ============================================================================
// NAVIGATION PROGRESS — THE BAR
// ============================================================================
// Every page renders on the server per request (the root layout reads the
// session), so a tap on a link can take a moment before anything changes.
// With no feedback, people tap again and again. From the instant a link is
// clicked until the new URL renders, this shows a yellow bar along the bottom
// of the navbar; the Navbar adds a spinner beside the wordmark.
//
// The App Router has no navigation events. So this listens for clicks on
// same-origin links, in the capture phase so it runs before Next's <Link>
// handles them, and finishes when the pathname or query string changes.
// A click that will not leave the page (the current URL, a #hash, a new tab,
// a download, another site) never starts it.
// ============================================================================

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { finishNavigation, startNavigation, useNavigationPhase } from "@/lib/navigation-progress";

function leavesPage(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

export function NavigationProgress() {
  const pathname = usePathname();
  // A string, not the params object, so the effect below runs only when the
  // query actually changes.
  const search = useSearchParams().toString();
  const phase = useNavigationPhase();

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (leavesPage(event)) startNavigation();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new URL has rendered: the navigation landed.
  useEffect(() => {
    finishNavigation();
  }, [pathname, search]);

  return (
    // bottom-px: a hairline of ink below keeps the bar distinct from the
    // yellow hero on the home page.
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-px h-[3px] overflow-hidden">
      <div data-state={phase} className="nav-progress h-full w-full bg-phase-yellow" />
    </div>
  );
}
