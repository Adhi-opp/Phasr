// src/features/market/copperRate.ts
// ============================================================================
// COPPER RATE — READ
// ============================================================================
// The public face of the PriceSnapshot table: the navbar shows the latest
// rate on every page, and /copper-rate lists the recent ones.
//
// Cached for an hour under COPPER_RATE_TAG, so the menu costs no query per
// page view. Both writers clear the tag (the daily cron and the /admin
// form), so a new rate shows at once rather than up to an hour later.
//
// Never throws. The rate is decoration on every page; a database hiccup must
// leave it out, not turn every page into an error.
// ============================================================================

import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { CopperReading } from "./format";

export const COPPER_RATE_TAG = "copper-rate";

const readHistory = unstable_cache(
  async (limit: number): Promise<CopperReading[]> => {
    const rows = await prisma.priceSnapshot.findMany({
      where: { effectiveDate: { lte: new Date() } },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: { baseCopperRate: true, source: true, effectiveDate: true },
    });
    // ISO strings, not Dates: the cache stores JSON.
    return rows.map((row) => ({
      rate: row.baseCopperRate,
      source: row.source,
      effectiveDate: row.effectiveDate.toISOString(),
    }));
  },
  ["copper-rate-history"],
  { revalidate: 3600, tags: [COPPER_RATE_TAG] }
);

/** Newest first. Empty when none is recorded or the read fails. */
export async function getCopperRateHistory(limit = 8): Promise<CopperReading[]> {
  try {
    return await readHistory(limit);
  } catch (error) {
    logger.error("Copper rate read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function getLatestCopperRate(): Promise<CopperReading | null> {
  const [latest] = await getCopperRateHistory(1);
  return latest ?? null;
}
