"use server";

// src/features/waitlist/actions.ts
// ============================================================================
// SNAP-TO-BOM WAITLIST
// ============================================================================
// The one public write that needs no account. Three rules:
//   1. The same reply for a new email and one already on the list, so the
//      form cannot be used to check who signed up. createMany with
//      skipDuplicates turns a repeat into ON CONFLICT DO NOTHING: no error
//      path to handle, and no timing difference worth measuring.
//   2. A honeypot field. A filled one gets the same success reply and
//      writes nothing, so a bot learns nothing from the response.
//   3. The email is never logged.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { WAITLIST_HONEYPOT, waitlistEmailSchema, type WaitlistState } from "./schema";

export async function joinWaitlistAction(
  _previous: WaitlistState,
  formData: FormData
): Promise<WaitlistState> {
  const trap = formData.get(WAITLIST_HONEYPOT);
  if (typeof trap === "string" && trap.trim() !== "") {
    return { status: "success" };
  }

  const raw = formData.get("email");
  const parsed = waitlistEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
      email: typeof raw === "string" ? raw.slice(0, 254) : "",
    };
  }

  try {
    await prisma.waitlistSubscriber.createMany({
      data: [{ email: parsed.data }],
      skipDuplicates: true,
    });
  } catch (error) {
    logger.error("Waitlist sign-up failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "error",
      message: "Something went wrong. Please try again.",
      email: parsed.data,
    };
  }

  return { status: "success" };
}
