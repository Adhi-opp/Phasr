"use server";

import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// .strict(): the form sends exactly these keys, so anything else is a crafted
// payload. Fields are also mapped one by one below, never spread into Prisma,
// so an extra key like approvalStatus could not reach the database either way.
const dealerProfileSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is required").max(200),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      "Enter a valid 15-character GSTIN"
    )
    .optional()
    .or(z.literal("")),
  address: z.string().trim().min(5, "Address is required").max(500),
  city: z.string().trim().min(2, "City is required").max(100),
  state: z.string().trim().min(2, "State is required").max(100),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode"),
  // Comma-separated, split into arrays below. Bounded so a single request
  // cannot store an unbounded array on the profile.
  serviceAreas: z.string().trim().min(1, "At least one service area is required").max(1000),
  brandsSold: z.string().trim().min(1, "At least one brand is required").max(500),
}).strict();

export type DealerProfileInput = z.infer<typeof dealerProfileSchema>;

export type SaveDealerProfileResult =
  | {
      success: true;
      profileId: string;
      /** The company name or GSTIN changed, so approval was withdrawn and the
          profile is back in the admin queue. */
      reverification: boolean;
    }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function saveDealerProfileAction(
  raw: DealerProfileInput
): Promise<SaveDealerProfileResult> {
  const authz = await requireRole(["DEALER", "ADMIN"]);
  if (!authz.ok) {
    return {
      success: false,
      error:
        authz.code === "FORBIDDEN" ? "Only dealer accounts can set up a dealer profile." : authz.error,
    };
  }
  const userId = authz.userId;

  const parsed = dealerProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { success: false, error: message };
  }

  const data = parsed.data;
  const serviceAreas = data.serviceAreas
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const brandsSold = data.brandsSold
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const gstin = data.gstin || null;

  try {
    const { profileId, reverification } = await prisma.$transaction(async (tx) => {
      const existing = await tx.dealerProfile.findUnique({
        where: { userId },
        select: { companyName: true, gstin: true, approvalStatus: true },
      });

      // Approval vouches for one legal identity. A new company name or GSTIN
      // is, as far as that check is concerned, a different business — so it
      // goes back to the queue. submitQuoteTransaction refuses bids from any
      // profile that is not APPROVED, so bidding stops in the same write.
      // Address, service areas and brands are operational details and stay
      // editable without re-review.
      const identityChanged =
        existing !== null &&
        (existing.companyName !== data.companyName || existing.gstin !== gstin);

      const profile = await tx.dealerProfile.upsert({
        where: { userId },
        update: {
          companyName: data.companyName,
          gstin,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          serviceAreas,
          brandsSold,
          ...(identityChanged ? { approvalStatus: "PENDING" as const } : {}),
        },
        create: {
          userId,
          companyName: data.companyName,
          gstin,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          serviceAreas,
          brandsSold,
        },
        select: { id: true },
      });

      return {
        profileId: profile.id,
        reverification: identityChanged && existing.approvalStatus !== "PENDING",
      };
    });

    if (reverification) {
      logger.info("Dealer identity changed; approval withdrawn pending re-verification", {
        userId,
      });
    }

    return { success: true, profileId, reverification };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("Unique constraint") &&
      err.message.includes("gstin")
    ) {
      return { success: false, error: "This GSTIN is already registered with another account." };
    }
    logger.error("Failed to save dealer profile", {
      error: err instanceof Error ? err.message : "Unknown",
      userId,
    });
    return { success: false, error: "Failed to save profile. Please try again." };
  }
}
