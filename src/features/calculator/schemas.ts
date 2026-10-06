// src/features/calculator/schemas.ts
// ============================================================================
// ZOD v4 VALIDATION SCHEMA FOR LAYOUT INPUT
// ============================================================================
// Mirrors LayoutInput exactly. This schema is the single source of validation
// truth for the calculator form. The engine never sees invalid input.
// ============================================================================

import { z } from "zod";
import { PINCODE_FORMAT_MESSAGE, PINCODE_PATTERN, pincodeIssue } from "./pincode";

// Zod compiles object parsers with `new Function` when it can, and finds out
// by trying it once. Under the site's Content-Security-Policy (no
// 'unsafe-eval'; see src/middleware.ts) that probe is blocked and logged as a
// violation. Jitless mode skips both; the speed difference is immaterial for
// one small form. It must run before the first z.object() below: this is the
// only object schema the browser builds.
z.config({ jitless: true });

export const layoutSchema = z
  .object({
    propertyType: z.enum(["FLAT", "BUILDER_FLOOR", "DUPLEX"]),
    // Bounded because the layout is persisted verbatim in Project.inputData
    // and city also keys a database lookup; the public calculator must not
    // accept a megabyte of either.
    city: z.string().trim().max(60).optional(),
    // The site's pin code. Optional here, because a layout is also checked
    // where none exists: a plan read by Snap-to-BOM, and drafts saved before
    // the calculator asked. The calculator requires it, and so does saving
    // (createQuoteRequestAction).
    pincode: z.string().trim().regex(PINCODE_PATTERN, PINCODE_FORMAT_MESSAGE).optional(),
    bedrooms: z.number().int().min(1).max(5),
    bathrooms: z.number().int().min(1).max(4),
    balconies: z.number().int().min(0).max(3),
    totalFloors: z.number().int().min(1).max(2),
    approxSqFt: z.number().positive().max(20_000).optional(),
    modularKitchen: z.boolean(),
    acInBedrooms: z.boolean(),
    acInLivingRoom: z.boolean(),
    geyserInBathrooms: z.boolean(),
  })
  .refine(
    (data) => {
      if (data.propertyType === "DUPLEX") return data.totalFloors >= 2;
      return true;
    },
    {
      message: "Duplex property requires 2 floors",
      path: ["totalFloors"],
    }
  )
  .refine(
    (data) => data.bathrooms <= data.bedrooms + 1,
    {
      message: "Bathrooms cannot exceed bedrooms + 1",
      path: ["bathrooms"],
    }
  )
  .superRefine((data, ctx) => {
    // The pin code must be in the city's state: the city picks the
    // three-phase rule, so a mismatch means one of them is wrong.
    // A malformed one has already been reported by the field itself.
    if (!data.pincode || !PINCODE_PATTERN.test(data.pincode)) return;
    const issue = pincodeIssue(data.pincode, data.city);
    if (issue) ctx.addIssue({ code: "custom", message: issue, path: ["pincode"] });
  });

export type LayoutFormValues = z.infer<typeof layoutSchema>;
