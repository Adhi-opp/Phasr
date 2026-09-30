"use client";

// src/components/count-up.tsx
// ============================================================================
// COUNT-UP FIGURE
// ============================================================================
// Runs a headline figure up to its value in 400ms, ease-out, so the eye lands
// on it as the sheet settles. Three rules keep it from lying about a number
// that the whole screen exists to state:
//
//   - Server-rendered figures never animate. A mount during hydration starts
//     at the final value; only a mount that happens after hydration (a fresh
//     calculation, a client-side navigation) counts from zero. Otherwise the
//     correct server HTML would paint, snap to 0 on hydration, and count back.
//   - Screen readers only ever get the final value; the moving digits are
//     aria-hidden.
//   - The final value is laid out invisibly underneath, so the box has its
//     finished width from the first frame and nothing beside it shifts as
//     digits are added.
//
// When the value changes (a recalculation) it runs from the old figure to the
// new one rather than from zero — a meter moving, not a reset.
// prefers-reduced-motion skips straight to the value.
// ============================================================================

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function CountUp({
  value,
  format,
  durationMs = 400,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  // false while hydrating server HTML, true for any mount after that.
  const mountedAfterHydration = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  const [display, setDisplay] = useState(() =>
    mountedAfterHydration && !prefersReducedMotion() ? 0 : value
  );
  const displayRef = useRef(display);

  useEffect(() => {
    const from = displayRef.current;
    if (from === value) return;

    const duration = prefersReducedMotion() ? 0 : durationMs;
    const start = performance.now();
    let frame = 0;

    const tick = (t: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = p === 1 ? value : from + (value - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span className="inline-grid">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {format(value)}
      </span>
      <span aria-hidden="true" className="col-start-1 row-start-1 text-right">
        {format(display)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
