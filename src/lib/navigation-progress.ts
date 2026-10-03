// src/lib/navigation-progress.ts
// ============================================================================
// NAVIGATION PROGRESS — STATE
// ============================================================================
// A tiny store shared by the bar under the navbar and the spinner beside the
// wordmark (components/navigation-progress.tsx, components/Navbar.tsx).
// startNavigation() runs on a link click; finishNavigation() once the new URL
// has rendered. Module-level state is fine here: it only ever runs in the
// browser, and there is one navigation at a time.
// ============================================================================

import { useSyncExternalStore } from "react";

export type NavigationPhase = "idle" | "loading" | "done";

/** A navigation that never lands (a failed fetch, say) stops showing as loading after this. */
const GIVE_UP_MS = 15_000;

/** How long the filled bar stays before it fades. */
const DONE_MS = 400;

let phase: NavigationPhase = "idle";
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: NavigationPhase): void {
  phase = next;
  for (const listener of listeners) listener();
}

export function startNavigation(): void {
  clearTimeout(timer);
  set("loading");
  timer = setTimeout(() => set("idle"), GIVE_UP_MS);
}

export function finishNavigation(): void {
  if (phase !== "loading") return;
  clearTimeout(timer);
  set("done");
  timer = setTimeout(() => set("idle"), DONE_MS);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNavigationPhase(): NavigationPhase {
  return useSyncExternalStore(
    subscribe,
    () => phase,
    () => "idle"
  );
}
