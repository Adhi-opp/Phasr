// src/features/calculator/whatsappExport.ts
// ============================================================================
// WHATSAPP "KACCHA CHIT"
// ============================================================================
// The material list as plain text, shaped like the chit a contractor sends a
// dealer: quantities in the units they are sold in (coils, pieces, metres),
// trade vocabulary ("sqmm", "Type C", "4P"), one line per item.
//
// No prices, on purpose. This goes to dealers for pricing, and a figure in it
// would anchor their bid — the same reason the dealer requisition shows no
// per-line platform prices.
//
// *Bold* section heads are WhatsApp's own markup, so the chit reads as a
// structured list in the chat rather than one wall of text.
// ============================================================================

import type { BOMItem, BOMResult } from "./type";

/** "1.5 sq mm FR PVC Copper Wire (Lighting)" -> "Lighting". */
function purposeOf(description: string): string | null {
  const match = description.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : null;
}

/** 1.5 -> "1.5 sqmm", 4 -> "4 sqmm": the way sizes are written at a counter. */
function sqmm(size: number): string {
  return `${size} sqmm`;
}

function cableLine(item: Extract<BOMItem, { category: "WIRE" | "EARTH_WIRE" }>): string {
  const purpose = item.category === "EARTH_WIRE" ? "Earth" : purposeOf(item.description);
  return `${sqmm(item.sizeSqMm)}${purpose ? ` ${purpose}` : ""} — ${item.coilsRequired} × ${item.coilLengthMeters} m coil`;
}

function protectionLine(item: BOMItem): string | null {
  switch (item.category) {
    case "MCB":
      return `MCB ${item.ratingAmps}A Type ${item.type} × ${item.quantity}`;
    case "RCCB":
      return `RCCB ${item.ratingAmps}A ${item.sensitivityMa}mA ${item.poles}P × ${item.quantity}`;
    case "MAIN_SWITCH":
      return `Main switch ${item.ratingAmps}A ${item.poles}P × ${item.quantity}`;
    case "DB":
      return `DB ${item.ways}-way × ${item.quantity}`;
    default:
      return null;
  }
}

function block(title: string, lines: string[]): string[] {
  return lines.length > 0 ? [`*${title}*`, ...lines, ""] : [];
}

/**
 * Formats a BOM as a WhatsApp-ready material list.
 * @param appUrl optional link appended as the footer, so a forwarded chit
 *   carries its source.
 */
export function formatBomForWhatsApp(result: BOMResult, appUrl?: string): string {
  const cable: string[] = [];
  const protection: string[] = [];
  const conduit: string[] = [];
  const accessories: string[] = [];

  for (const item of result.items) {
    if (item.category === "WIRE" || item.category === "EARTH_WIRE") {
      cable.push(cableLine(item));
    } else if (item.category === "CONDUIT") {
      conduit.push(`${item.sizeMm} PVC conduit — ${Math.ceil(item.totalMeters)} m`);
    } else if (item.category === "SWITCHGEAR") {
      accessories.push(`${item.description} × ${item.quantity}`);
    } else {
      const line = protectionLine(item);
      if (line) protection.push(line);
    }
  }

  const supply = result.phaseDecision.finalRecommendation === "THREE" ? "3-Phase" : "1-Phase";

  return [
    "*Phasr Material Spec*",
    `${supply} · ${result.totalConnectedLoadKw.toFixed(2)} kW connected · ${result.maxDemandKw.toFixed(2)} kW max demand`,
    "",
    ...block("Cable", cable),
    ...block("Protection", protection),
    ...block("Conduit", conduit),
    ...block("Switches & Sockets", accessories),
    "Please quote for the above. Brand and wire grade (FR / FRLS / ZHFR) to be stated.",
    ...(appUrl ? [`— via Phasr ${appUrl.replace(/\/$/, "")}`] : []),
  ].join("\n");
}

/** A wa.me share link: opens WhatsApp's chat picker with the text filled in. */
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
