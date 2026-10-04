// src/app/api/vision/parse-floorplan/route.ts
// ============================================================================
// SNAP-TO-BOM: FLOOR PLAN → ROOMS → BOM  (skeleton, admin-only)
// ============================================================================
// POST multipart/form-data with the drawing in a field named "file" (PNG,
// JPEG, WebP or PDF, up to 4 MB). Returns:
//   extraction  what the vision model read, validated (features/vision/floorPlan)
//   rooms       RoomSpec[] with the plan's real dimensions
//   layout      the same house as the calculator form's LayoutInput, or null
//   preview     those rooms through calculateBOM(): the deterministic engine
//               does all the electrical work; the model only reads the plan
//   warnings    what a person should check before trusting any of it
//
// ADMIN-only while Snap-to-BOM is marked Coming soon: every call spends
// model quota, and nothing here is ready for the public.
//
// The 4 MB cap sits under Vercel's 4.5 MB request-body limit for functions.
// The browser shrinks photos before sending them (features/vision/
// prepareUpload.ts), which also strips their EXIF location data; this check
// is for any other caller. Larger PDFs will need direct-to-storage uploads.
// ============================================================================

import { requireRole } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { calculateBOM } from "@/features/calculator/calculateBOM";
import { buildCalculatorInputFromRooms } from "@/features/calculator/generateRoomSpecs";
import { floorPlanExtractionSchema } from "@/features/vision/floorPlan";
import { extractWithGemini, geminiConfig, GeminiError } from "@/features/vision/gemini";
import { floorPlanToCalculator } from "@/features/vision/toCalculator";
import { MAX_UPLOAD_BYTES } from "@/features/vision/uploadLimits";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

/**
 * The file's real type from its first bytes. The browser's Content-Type is
 * whatever the caller says it is, so it is ignored.
 */
function sniffType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

function reply(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

export async function POST(request: Request) {
  const authz = await requireRole(["ADMIN"]);
  if (!authz.ok) {
    const status = authz.code === "UNAUTHENTICATED" ? 401 : authz.code === "FORBIDDEN" ? 403 : 500;
    return reply(status, { ok: false, error: authz.error });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(400, { ok: false, error: 'Send the drawing as multipart/form-data in a field named "file".' });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return reply(400, { ok: false, error: 'Send the drawing as multipart/form-data in a field named "file".' });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return reply(413, { ok: false, error: "The drawing is over 4 MB. Export it smaller, or as a JPEG." });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = sniffType(bytes);
  if (!mimeType) {
    return reply(415, { ok: false, error: "Upload a PNG, JPEG, WebP or PDF." });
  }

  const config = geminiConfig();
  if (!config) {
    return reply(503, { ok: false, error: "Floor-plan reading is not configured: set GEMINI_API_KEY." });
  }

  let raw: unknown;
  try {
    raw = await extractWithGemini({ bytes, mimeType }, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Floor-plan extraction failed", { model: config.model, error: message });
    const status = error instanceof GeminiError && error.status === 429 ? 429 : 502;
    return reply(status, { ok: false, error: "The vision model could not read this drawing.", detail: message });
  }

  const parsed = floorPlanExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error("Floor-plan reply failed validation", {
      model: config.model,
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
    return reply(502, { ok: false, error: "The vision model's reply was not in the expected shape." });
  }

  const extraction = parsed.data;
  if (!extraction.isFloorPlan || extraction.rooms.length === 0) {
    return reply(422, { ok: false, error: "This does not look like a readable floor plan.", notes: extraction.notes });
  }

  const handoff = floorPlanToCalculator(extraction);
  if (handoff.rooms.length === 0) {
    return reply(422, { ok: false, error: "No usable rooms were found.", warnings: handoff.warnings });
  }

  // The handoff end to end: the plan's rooms through the calculator's engine.
  let preview: Record<string, unknown> | null = null;
  try {
    const bom = calculateBOM(buildCalculatorInputFromRooms(handoff.rooms, { projectName: "Floor plan upload" }));
    preview = {
      totalConnectedLoadKw: bom.totalConnectedLoadKw,
      maxDemandKw: bom.maxDemandKw,
      recommendedPhase: bom.recommendedPhase,
      totalCircuits: bom.totalCircuits,
    };
  } catch (error) {
    logger.error("Floor-plan BOM preview failed", { error: error instanceof Error ? error.message : String(error) });
    handoff.warnings.push("The estimate could not be computed from these rooms. Check them in the calculator.");
  }

  return reply(200, {
    ok: true,
    model: config.model,
    extraction,
    rooms: handoff.rooms,
    layout: handoff.layout,
    summary: handoff.summary,
    preview,
    warnings: handoff.warnings,
  });
}
