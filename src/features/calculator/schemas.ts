// src/features/calculator/schemas.ts
// ============================================================================
// ZOD v4 VALIDATION SCHEMA FOR LAYOUT INPUT
// ============================================================================
// Mirrors LayoutInput exactly. This schema is the single source of validation
// truth for the calculator form. The engine never sees invalid input.
// ============================================================================

import { z } from "zod";

export const layoutSchema = z
  .object({
    propertyType: z.enum(["FLAT", "BUILDER_FLOOR", "DUPLEX"]),
    // Bounded because the layout is persisted verbatim in Project.inputData
    // and city also keys a database lookup; the public calculator must not
    // accept a megabyte of either.
    city: z.string().trim().max(60).optional(),
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
  );

export type LayoutFormValues = z.infer<typeof layoutSchema>;
