// src/features/market/benchmarks.ts
// ============================================================================
// COPPER AND USD/INR BENCHMARKS
// ============================================================================
// The two inputs to the parity formula, fetched fresh on every cron run.
//
// COMEX copper: Yahoo Finance's chart endpoint for HG=F (front-month COMEX
// copper, US$ per lb). It is unofficial and undocumented: it can change
// shape or block a server without notice, and Yahoo's terms do not cover
// commercial use. So every response is shape-checked, and any failure
// throws: the cron then records nothing and the last rate stands.
//
// USD/INR: the European Central Bank's daily reference rate via
// frankfurter.dev, which is official, keyless and stable. It is published
// around 16:00 CET, so a 5 PM IST run uses the previous working day's rate;
// for a daily baseline that is a rounding error. Yahoo's INR=X is the
// fallback if Frankfurter is down.
// ============================================================================

import "server-only";
import { z } from "zod";

const TIMEOUT_MS = 8_000;
const USER_AGENT = "Phasr/1.0 (+https://volt-flow-nine.vercel.app)";

/** An ECB rate older than this means Frankfurter is serving stale data. */
const MAX_FX_AGE_DAYS = 5;

export type Benchmark = {
  value: number;
  /** When the market last priced it. */
  asOf: Date;
  /** Who supplied it, for the cron's log. */
  provider: string;
};

const yahooChartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string(),
            regularMarketPrice: z.number(),
            regularMarketTime: z.number(),
          }),
        })
      )
      .min(1),
  }),
});

const frankfurterSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.object({ INR: z.number() }),
});

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered HTTP ${res.status}`);
  return res.json();
}

async function yahooQuote(symbol: string, currency: string): Promise<Benchmark> {
  const json = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
  );
  const parsed = yahooChartSchema.safeParse(json);
  if (!parsed.success) throw new Error(`Yahoo ${symbol}: unexpected response shape`);

  const meta = parsed.data.chart.result[0].meta;
  // HG=F in anything but US dollars (cents, say) would be 100× off.
  if (meta.currency !== currency) {
    throw new Error(`Yahoo ${symbol}: quoted in ${meta.currency}, expected ${currency}`);
  }
  return {
    value: meta.regularMarketPrice,
    asOf: new Date(meta.regularMarketTime * 1000),
    provider: `Yahoo ${symbol}`,
  };
}

/** COMEX copper, US$ per lb. */
export function fetchComexCopper(): Promise<Benchmark> {
  return yahooQuote("HG=F", "USD");
}

/** Rupees per US dollar: ECB reference rate, Yahoo INR=X if that fails. */
export async function fetchUsdInr(): Promise<Benchmark> {
  try {
    const parsed = frankfurterSchema.safeParse(
      await getJson("https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR")
    );
    if (!parsed.success) throw new Error("Frankfurter: unexpected response shape");

    const asOf = new Date(`${parsed.data.date}T14:15:00Z`); // ECB fixing time
    const ageDays = (Date.now() - asOf.getTime()) / 86_400_000;
    if (ageDays > MAX_FX_AGE_DAYS) throw new Error(`Frankfurter: rate is from ${parsed.data.date}`);

    return { value: parsed.data.rates.INR, asOf, provider: "ECB via Frankfurter" };
  } catch (primaryError) {
    try {
      return await yahooQuote("INR=X", "INR");
    } catch (fallbackError) {
      throw new Error(
        `USD/INR unavailable: ${(primaryError as Error).message}; ${(fallbackError as Error).message}`
      );
    }
  }
}
