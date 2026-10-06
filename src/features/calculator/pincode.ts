// src/features/calculator/pincode.ts
// ============================================================================
// THE SITE PIN CODE
// ============================================================================
// Where the home is. A saved estimate records it, so demand can be counted by
// area, and a request carries it to the dealers who will deliver there.
//
// Six digits, never starting with 0: India Post has no zone 0. The first two
// digits are the postal circle, which follows state lines: 11 is Delhi, 12
// and 13 are Haryana, 20 to 28 are Uttar Pradesh (a range Uttarakhand shares).
// That makes the pin code checkable against the city chosen with it, and the
// check matters, because the city picks the three-phase rule. A Noida pin
// code on an estimate set to Delhi would put a UP home under Delhi's rule.
//
// Pure, with no server imports: the calculator validates with it in the
// browser and again on the server.
// ============================================================================

import { ncrStateFor, type NcrState } from "./regulatoryPolicy";

export const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

export const PINCODE_FORMAT_MESSAGE = "Enter the site's 6-digit pin code.";

const POSTAL_CIRCLES: Record<NcrState, RegExp> = {
  Delhi: /^11/,
  Haryana: /^1[23]/,
  "Uttar Pradesh": /^2[0-8]/,
};

/**
 * What is wrong with a site pin code for this city, or null if nothing is.
 * Only NCR cities are checked against their state; "NCR" alone names no state.
 */
export function pincodeIssue(pincode: string, city: string | undefined): string | null {
  if (!PINCODE_PATTERN.test(pincode)) return PINCODE_FORMAT_MESSAGE;
  const state = city ? ncrStateFor(city) : null;
  if (state && !POSTAL_CIRCLES[state].test(pincode)) {
    return `${pincode} is outside ${state}. Check the pin code, or pick the right city.`;
  }
  return null;
}
