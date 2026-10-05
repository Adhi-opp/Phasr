// src/features/quotes/wireGrade.ts
// ============================================================================
// WIRE INSULATION GRADE
// ============================================================================
// One vocabulary shared by the dealer's submit form, the server-side validator
// and the buyer's comparison matrix, so the three cannot drift apart.
//
// The *code* is what goes in the database. The long form is a display label.
// Storing "FRLS (Flame Retardant Low Smoke)" in the column would make every
// downstream comparison a string-matching problem and blow out the table
// column, so the code is the stored value and the labels live here.
//
// Grades are ordered by escalating fire performance:
//   FR    standard flame-retardant PVC — the default in NCR residential
//   FRLS  flame retardant, low smoke — reduced smoke/HCl on burning
//   ZHFR  zero halogen flame retardant — no halogen gases at all
//
// This matters for price comparison: two dealers quoting the same brand at FR
// and ZHFR are not quoting the same job, and the cheaper one is not the better
// deal. That is the entire reason the column exists.
// ============================================================================

export const WIRE_GRADES = ["FR", "FRLS", "ZHFR"] as const;

export type WireGrade = (typeof WIRE_GRADES)[number];

interface WireGradeMeta {
  /** Long form, used in the dealer's dropdown. */
  label: string;
  /** Column-width form, used in the comparison matrix. */
  short: string;
  /** Tooltip / expansion of the acronym. */
  description: string;
}

export const WIRE_GRADE_META: Record<WireGrade, WireGradeMeta> = {
  FR: {
    label: "Standard FR",
    short: "FR",
    description: "Flame Retardant",
  },
  FRLS: {
    label: "FRLS (Flame Retardant Low Smoke)",
    short: "FRLS",
    description: "Flame Retardant Low Smoke",
  },
  ZHFR: {
    label: "ZHFR (Zero Halogen)",
    short: "ZHFR",
    description: "Zero Halogen Flame Retardant",
  },
};

export function isWireGrade(value: unknown): value is WireGrade {
  return (
    typeof value === "string" && (WIRE_GRADES as readonly string[]).includes(value)
  );
}

/**
 * Display form for a stored value.
 *
 * Returns null for null/unknown input rather than guessing. Quotes submitted
 * before this field existed have no grade, and inventing one would be worse
 * than an empty cell.
 */
export function wireGradeShort(value: string | null | undefined): string | null {
  return isWireGrade(value) ? WIRE_GRADE_META[value].short : null;
}

export function wireGradeDescription(
  value: string | null | undefined
): string | null {
  return isWireGrade(value) ? WIRE_GRADE_META[value].description : null;
}
