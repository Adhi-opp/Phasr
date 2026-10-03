// src/app/api/cron/update-copper/route.ts
// ============================================================================
// DAILY COPPER RATE (Vercel Cron, 5 PM IST)
// ============================================================================
// Fetches COMEX copper and USD/INR, turns them into an Indian parity rate in
// ₹/kg (features/market/parity.ts) and appends it to PriceSnapshot, the same
// table /admin writes to. Scheduled in vercel.json.
//
// Only Vercel may call it: Vercel sends "Authorization: Bearer <CRON_SECRET>"
// once CRON_SECRET is set on the project. With no secret configured, every
// call is refused, so a missing variable can never leave the route open.
//
// Fails closed. Any fetch error, implausible number or suspicious jump means
// nothing is written and the last rate stands. Non-2xx responses show up as
// failed runs in Vercel's cron log.
// ============================================================================

import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { fetchComexCopper, fetchUsdInr } from "@/features/market/benchmarks";
import { COPPER_RATE_TAG } from "@/features/market/copperRate";
import { PARITY_SOURCE } from "@/features/market/format";
import { decideParity, INDIA_PREMIUM_MULTIPLIER } from "@/features/market/parity";

export const dynamic = "force-dynamic";

function isVercelCron(request: Request, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error("Copper cron: CRON_SECRET is not set; refusing to run");
    return Response.json({ ok: false, error: "Cron is not configured" }, { status: 500 });
  }
  if (!isVercelCron(request, secret)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let copper, fx;
  try {
    [copper, fx] = await Promise.all([fetchComexCopper(), fetchUsdInr()]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Copper cron: benchmark fetch failed", { error: message });
    return Response.json({ ok: false, error: `Benchmark fetch failed: ${message}` }, { status: 502 });
  }

  const inputs = {
    comexUsdPerLb: copper.value,
    comexAsOf: copper.asOf.toISOString(),
    usdInr: fx.value,
    usdInrAsOf: fx.asOf.toISOString(),
    usdInrProvider: fx.provider,
    multiplier: INDIA_PREMIUM_MULTIPLIER,
  };

  try {
    const now = new Date();
    const [latest, lastParity] = await Promise.all([
      prisma.priceSnapshot.findFirst({
        where: { effectiveDate: { lte: now } },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        select: { baseCopperRate: true, effectiveDate: true },
      }),
      prisma.priceSnapshot.findFirst({
        where: { source: PARITY_SOURCE },
        orderBy: { effectiveDate: "desc" },
        select: { effectiveDate: true },
      }),
    ]);

    const decision = decideParity({
      usdPerLb: copper.value,
      usdInr: fx.value,
      quoteTime: copper.asOf,
      now,
      latest: latest ? { rate: latest.baseCopperRate, effectiveDate: latest.effectiveDate } : null,
      lastParityAt: lastParity?.effectiveDate ?? null,
    });

    if (decision.action === "skip") {
      logger.info("Copper cron: skipped", { reason: decision.reason, ...inputs });
      return Response.json({ ok: true, skipped: decision.reason, inputs });
    }
    if (decision.action === "refuse") {
      logger.error("Copper cron: refused", { reason: decision.reason, ...inputs });
      return Response.json({ ok: false, refused: decision.reason, inputs }, { status: 422 });
    }

    const snapshot = await prisma.priceSnapshot.create({
      data: { baseCopperRate: decision.rate, source: PARITY_SOURCE, effectiveDate: now },
      select: { id: true, effectiveDate: true },
    });

    // Expire the navbar's cached rate now, not when its hour runs out.
    // updateTag is for server actions; this is the route-handler equivalent.
    revalidateTag(COPPER_RATE_TAG, { expire: 0 });

    logger.info("Copper cron: recorded", { rate: decision.rate, snapshotId: snapshot.id, ...inputs });
    return Response.json({
      ok: true,
      recorded: {
        ratePerKg: decision.rate,
        snapshotId: snapshot.id,
        effectiveDate: snapshot.effectiveDate.toISOString(),
      },
      inputs,
    });
  } catch (error) {
    logger.error("Copper cron: database step failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ ok: false, error: "Database step failed" }, { status: 500 });
  }
}
