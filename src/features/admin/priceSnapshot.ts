// src/features/admin/priceSnapshot.ts
// ============================================================================
// COPPER PRICE SNAPSHOT INPUT
// ============================================================================
// A daily cron records a COMEX parity rate (features/market/parity.ts); an
// admin can still type a rate in by hand, to correct a bad day or record an
// MCX figure. This is the validation for that one input, kept out of the
// "use server" file so the admin form and the spec can import it too. The
// cron's source, COMEX_PARITY, is deliberately not offered here.
//
// Rates are ₹ per kg. MCX copper traded around ₹1,400/kg through Sep 2026.
// The ceiling is there to catch a unit slip: an LME reading is ~$14,600 per
// tonne, and entered as-is it would stamp every new project with a tenfold
// copper spike.
// ============================================================================

import { z } from "zod";

/** Where a reading came from. MANUAL covers a dealer circular or a call. */
export const PRICE_SNAPSHOT_SOURCES = ["MCX", "LME", "MANUAL"] as const;
export type PriceSnapshotSource = (typeof PRICE_SNAPSHOT_SOURCES)[number];

export const COPPER_RATE_MIN_PER_KG = 100;
export const COPPER_RATE_MAX_PER_KG = 5_000;

export const priceSnapshotInputSchema = z
  .object({
    baseCopperRate: z
      .number()
      .min(COPPER_RATE_MIN_PER_KG, `Enter the rate in ₹ per kg (at least ₹${COPPER_RATE_MIN_PER_KG}).`)
      .max(
        COPPER_RATE_MAX_PER_KG,
        `Above ₹${COPPER_RATE_MAX_PER_KG}/kg — is this an LME $/tonne figure? Convert it to ₹/kg first.`
      ),
    source: z.enum(PRICE_SNAPSHOT_SOURCES),
  })
  .strict();
