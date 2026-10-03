// src/features/waitlist/schema.ts
// ============================================================================
// WAITLIST — INPUT AND STATE
// ============================================================================
// Kept out of the "use server" file, which may export only async functions,
// so the form and the spec can import these too.
// ============================================================================

import { z } from "zod";

/**
 * Trimmed and lowercased before the unique index sees it, so "Foo@x.com"
 * and "foo@x.com" are one sign-up. 254 is the longest valid address.
 */
export const waitlistEmailSchema = z.string().trim().toLowerCase().max(254).email();

/** The hidden bot-trap field. People never see it; form-filling bots fill it. */
export const WAITLIST_HONEYPOT = "website";

export type WaitlistState =
  | { status: "idle" }
  | { status: "success" }
  /** email echoes the attempt back, so the field keeps what was typed. */
  | { status: "error"; message: string; email: string };

export const WAITLIST_INITIAL_STATE: WaitlistState = { status: "idle" };
