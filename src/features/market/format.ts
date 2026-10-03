// src/features/market/format.ts
// ============================================================================
// COPPER RATE — SHAPE AND FORMATTING
// ============================================================================
// Shared by the server read (copperRate.ts) and the client navbar, so it holds
// no server imports.
//
// Dates are formatted in IST explicitly. Vercel renders in UTC, so a rate
// recorded at 1 a.m. IST would otherwise show the previous day on the server
// and the right day after hydration.
// ============================================================================

export type CopperReading = {
  /** ₹ per kg. */
  rate: number;
  /** MCX | LME | MANUAL from /admin (PRICE_SNAPSHOT_SOURCES), or PARITY_SOURCE from the daily cron. */
  source: string;
  /** ISO timestamp, server-stamped when the rate was recorded. */
  effectiveDate: string;
};

/** What the daily cron writes: COMEX copper converted at Indian market parity (parity.ts). */
export const PARITY_SOURCE = "COMEX_PARITY";

const SOURCE_LABEL: Record<string, string> = {
  [PARITY_SOURCE]: "COMEX parity",
  MANUAL: "Manual",
};

/** "COMEX_PARITY" → "COMEX parity"; MCX and LME read as they are. */
export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

const IST = "Asia/Kolkata";

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** 1401 → "₹1,401" */
export function formatRupees(rate: number): string {
  return rupees.format(rate);
}

/** "3 Oct" — for the menu and the home strip. */
export function formatReadingDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: IST,
  });
}

/** "3 Oct 2026" — for the copper rate page. */
export function formatReadingDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
}
