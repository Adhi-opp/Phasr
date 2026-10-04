// src/app/calculator/page.tsx
// ============================================================================
// CALCULATOR PAGE — RSC route shell
// ============================================================================
// Server Component. Sets metadata and renders the client-side CalculatorShell
// inside a centered max-w-4xl container.
// No data fetching. No auth. Pure UI entry point.
// ============================================================================

import type { Metadata } from "next";
import { CalculatorErrorBoundary } from "@/features/calculator/components/CalculatorErrorBoundary";
import { CalculatorShell } from "@/features/calculator/components/CalculatorShell";

export const metadata: Metadata = {
  title: "Free Electrical Wiring Calculator | IS 732 BOM Estimate",
  description:
    "Calculate your home electrical wiring costs instantly. Bill of Materials aligned with IS 732 standard practice — wires, MCBs, conduit, and more. Estimates only. Get dealer quotes in NCR.",
  keywords: [
    "electrical wiring calculator",
    "BOM calculator India",
    "IS 732",
    "home wiring cost",
    "electrical estimate",
    "wire gauge calculator",
  ],
  openGraph: {
    title: "Free Electrical Wiring Calculator — Phasr",
    description:
      "Bill of Materials aligned with IS 732 standard practice. Instant estimates for NCR homes.",
  },
};

export default function CalculatorPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Electrical BOM Calculator</h1>
        <p className="mt-2 text-muted-foreground">
          Aligned with IS 732 standard practice — estimates only, not a design
          document. For NCR residential properties. Select a preset or configure your
          own layout below.
        </p>
      </div>

      {/* Client shell — owns all state and engine calls */}
      <CalculatorErrorBoundary>
        <CalculatorShell />
      </CalculatorErrorBoundary>
    </main>
  );
}
