// src/lib/contact.ts
// ============================================================================
// CONTACT LINKS
// ============================================================================
// "Partner with Us" opens WhatsApp with a message already typed. The number
// comes from NEXT_PUBLIC_WHATSAPP_NUMBER; with none set the link is hidden
// rather than pointing nowhere.
//
// NEXT_PUBLIC_ because the navbar is a client component. It is inlined at
// build time, so changing the number on Vercel needs a redeploy.
// ============================================================================

const PARTNER_MESSAGE = "Hi VoltFlow, I'd like to partner with you.";

/**
 * wa.me wants the full international number, digits only. A bare 10-digit
 * number is taken as Indian: sent as-is it would reach a stranger in
 * whichever country those first digits belong to.
 */
export function buildWhatsAppUrl(raw: string | undefined, message: string): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (!/^[1-9]\d{10,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export const WHATSAPP_PARTNER_URL = buildWhatsAppUrl(
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  PARTNER_MESSAGE
);
