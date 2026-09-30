// src/lib/authz.ts
// ============================================================================
// SERVER ACTION GUARDS
// ============================================================================
// Every exported function in a "use server" file is a public HTTP endpoint.
// Anyone can POST to it with the action's ID and any payload they like,
// whatever the UI shows, hides or disables. So each action that writes to the
// database starts with requireRole(), and validates its arguments with Zod
// before any Prisma call. No exceptions for "the button is only rendered for
// admins".
//
// requireRole re-reads role and isActive from the database rather than
// trusting the session. The JWT is minted once at sign-in and lives for 30
// days, so a deactivated or demoted user would otherwise keep every
// permission they signed in with until it expired. One indexed lookup per
// mutation is cheap next to that; page reads still use the token alone.
// ============================================================================

import "server-only";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type Authorized = { ok: true; userId: string; role: Role };

export type Denied = {
  ok: false;
  code: "UNAUTHENTICATED" | "FORBIDDEN" | "INTERNAL_ERROR";
  error: string;
};

/**
 * The signed-in user, if their current database record is active and holds
 * one of the allowed roles. Never throws: a failed lookup denies.
 */
export async function requireRole(allowed: readonly Role[]): Promise<Authorized | Denied> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return { ok: false, code: "UNAUTHENTICATED", error: "You must be signed in." };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return {
        ok: false,
        code: "UNAUTHENTICATED",
        error: "This account is no longer active. Sign in again.",
      };
    }

    if (!allowed.includes(user.role)) {
      return { ok: false, code: "FORBIDDEN", error: "Your account cannot perform this action." };
    }

    return { ok: true, userId, role: user.role };
  } catch (err) {
    logger.error("Authorization check failed", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error: "Could not verify your account. Please try again.",
    };
  }
}

/**
 * A record id arriving from a caller: a cuid, or a readable seed id such as
 * "seed-project-002". The pattern matters as much as the length: typed as a
 * string in TypeScript, the argument can still arrive as an object at runtime,
 * and `{ not: "x" }` in a where clause is a Prisma filter, not an id.
 */
export const recordIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid id.");
