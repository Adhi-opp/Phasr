// src/features/vision/uploadLimits.ts
// ============================================================================
// FLOOR-PLAN UPLOAD LIMITS
// ============================================================================
// Shared by the browser, which shrinks a photo before sending it
// (prepareUpload.ts), and the API route, which refuses anything larger
// (app/api/vision/parse-floorplan). Pure: no DOM, no Node APIs.
// ============================================================================

/** Under Vercel's 4.5 MB request-body limit for functions, with room for the multipart envelope. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Longest side of an image after the browser shrinks it. Large enough that
 * the dimension labels on a photographed plan stay readable, small enough
 * that the JPEG lands far under MAX_UPLOAD_BYTES.
 */
export const MAX_IMAGE_EDGE_PX = 1920;

/** The size that fits inside maxEdge on both sides, keeping the aspect ratio. Never enlarges. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE_PX
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
