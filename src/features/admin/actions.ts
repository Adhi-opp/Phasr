"use server";

import { recordIdSchema, requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { priceSnapshotInputSchema } from "@/features/admin/priceSnapshot";
import { updateTag } from "next/cache";
import { COPPER_RATE_TAG } from "@/features/market/copperRate";
import {
  sendDealerApprovedNotification,
  sendDealerRejectedNotification,
} from "@/lib/email";

export type AdminActionResult =
  | { success: true }
  | { success: false; error: string };

/** Admin role guard, then id validation — both before any query runs. */
async function authorizeAdmin(
  rawDealerProfileId: unknown
): Promise<{ ok: true; dealerProfileId: string } | { ok: false; error: string }> {
  const authz = await requireRole(["ADMIN"]);
  if (!authz.ok) {
    return { ok: false, error: authz.code === "INTERNAL_ERROR" ? authz.error : "Access denied." };
  }
  const parsed = recordIdSchema.safeParse(rawDealerProfileId);
  if (!parsed.success) return { ok: false, error: "Invalid dealer profile id." };
  return { ok: true, dealerProfileId: parsed.data };
}

export async function approveDealerAction(
  rawDealerProfileId: string
): Promise<AdminActionResult> {
  const guard = await authorizeAdmin(rawDealerProfileId);
  if (!guard.ok) return { success: false, error: guard.error };
  const { dealerProfileId } = guard;

  try {
    const profile = await prisma.dealerProfile.update({
      where: { id: dealerProfileId },
      data: { approvalStatus: "APPROVED" },
      include: { user: { select: { email: true, name: true } } },
    });

    // Awaited: serverless may freeze the invocation once the response
    // returns, dropping an in-flight send.
    await sendDealerApprovedNotification(profile.user.email, {
      dealerName: profile.user.name ?? "Dealer",
      companyName: profile.companyName,
    }).catch((e) =>
      logger.error("Email: dealer approved notification failed", {
        error: e instanceof Error ? e.message : "Unknown",
        dealerProfileId,
      })
    );

    return { success: true };
  } catch (err) {
    logger.error("Failed to approve dealer", {
      error: err instanceof Error ? err.message : "Unknown",
      dealerProfileId,
    });
    return { success: false, error: "Failed to approve dealer." };
  }
}

export async function rejectDealerAction(
  rawDealerProfileId: string
): Promise<AdminActionResult> {
  const guard = await authorizeAdmin(rawDealerProfileId);
  if (!guard.ok) return { success: false, error: guard.error };
  const { dealerProfileId } = guard;

  try {
    const profile = await prisma.dealerProfile.update({
      where: { id: dealerProfileId },
      data: { approvalStatus: "REJECTED" },
      include: { user: { select: { email: true, name: true } } },
    });

    await sendDealerRejectedNotification(profile.user.email, {
      dealerName: profile.user.name ?? "Dealer",
      companyName: profile.companyName,
    }).catch((e) =>
      logger.error("Email: dealer rejected notification failed", {
        error: e instanceof Error ? e.message : "Unknown",
        dealerProfileId,
      })
    );

    return { success: true };
  } catch (err) {
    logger.error("Failed to reject dealer", {
      error: err instanceof Error ? err.message : "Unknown",
      dealerProfileId,
    });
    return { success: false, error: "Failed to reject dealer." };
  }
}

// ---------------------------------------------------------------------------
// Copper price snapshots
// ---------------------------------------------------------------------------

export type PriceSnapshotResult =
  | { success: true; snapshotId: string; effectiveDate: string }
  | { success: false; error: string };

/**
 * Records today's copper rate. Append-only: a correction is a new row with a
 * later timestamp, never an edit, because projects stamped with an earlier
 * snapshot must keep reading the rate they were priced against.
 *
 * effectiveDate is the server's clock, not the caller's. Backdating a reading
 * would slot it under projects that were never priced at it.
 */
export async function createPriceSnapshotAction(
  baseCopperRate: number,
  source: string
): Promise<PriceSnapshotResult> {
  const authz = await requireRole(["ADMIN"]);
  if (!authz.ok) {
    return { success: false, error: authz.code === "INTERNAL_ERROR" ? authz.error : "Access denied." };
  }

  const parsed = priceSnapshotInputSchema.safeParse({ baseCopperRate, source });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  try {
    const snapshot = await prisma.priceSnapshot.create({
      data: {
        baseCopperRate: parsed.data.baseCopperRate,
        source: parsed.data.source,
        effectiveDate: new Date(),
      },
      select: { id: true, effectiveDate: true },
    });

    logger.info("Copper price snapshot recorded", {
      snapshotId: snapshot.id,
      source: parsed.data.source,
      adminId: authz.userId,
    });

    // The navbar and /copper-rate read a cached copy; show the new rate now,
    // not when the hour-long cache runs out.
    updateTag(COPPER_RATE_TAG);

    return {
      success: true,
      snapshotId: snapshot.id,
      effectiveDate: snapshot.effectiveDate.toISOString(),
    };
  } catch (err) {
    logger.error("Failed to record price snapshot", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return { success: false, error: "Failed to record the copper rate." };
  }
}
