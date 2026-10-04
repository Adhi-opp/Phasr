// src/features/vision/prepareUpload.ts
// ============================================================================
// FLOOR-PLAN UPLOAD — BROWSER PREPARATION
// ============================================================================
// Runs in the browser before a drawing goes to /api/vision/parse-floorplan.
//
// A phone photo is often bigger than the 4 MB the route accepts, and its EXIF
// block can hold the GPS position it was taken at: for a floor plan, the
// location of someone's home. Redrawing the photo on a canvas and encoding
// that solves both. A canvas holds only pixels, so the new JPEG carries no
// metadata at all, and its longest side is capped at MAX_IMAGE_EDGE_PX.
//
// The EXIF orientation is applied while decoding, so a portrait shot stays
// upright after its metadata is gone.
//
// PDFs go through unchanged, since a canvas cannot redraw them. They still
// have to fit under the limit.
// ============================================================================

import { fitWithin, MAX_UPLOAD_BYTES } from "./uploadLimits";

/** Tried in order until the JPEG fits. At 1920 px the first one practically always does. */
const JPEG_QUALITIES = [0.85, 0.7, 0.55];

export type PreparedUpload = {
  file: File;
  originalBytes: number;
  /** Pixel size sent; null for a PDF. */
  width: number | null;
  height: number | null;
  /** True when the browser redrew the image, which drops all of its metadata. */
  reencoded: boolean;
};

/** A problem the person can act on; the message is written for them. */
export class UploadPreparationError extends Error {}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Some formats decode in an <img> but not here (HEIC in Safari). Try that.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new UploadPreparationError(
      "This photo could not be opened. Try a JPEG or PNG, or a screenshot of the plan."
    );
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function prepareFloorPlanUpload(file: File): Promise<PreparedUpload> {
  if (isPdf(file)) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new UploadPreparationError(
        "This PDF is over 4 MB. Export only the floor-plan page, or upload a photo of it."
      );
    }
    return { file, originalBytes: file.size, width: null, height: null, reencoded: false };
  }

  const image = await decode(file);
  try {
    const { width, height } = fitWithin(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new UploadPreparationError("This browser cannot prepare the photo. Try another browser.");
    }
    // JPEG has no transparency. Without a white fill, a transparent PNG
    // export of a plan comes out as black lines on black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image.source, 0, 0, width, height);

    for (const quality of JPEG_QUALITIES) {
      const blob = await toJpeg(canvas, quality);
      if (blob && blob.type === "image/jpeg" && blob.size <= MAX_UPLOAD_BYTES) {
        return {
          file: new File([blob], "floor-plan.jpg", { type: "image/jpeg" }),
          originalBytes: file.size,
          width,
          height,
          reencoded: true,
        };
      }
    }
    throw new UploadPreparationError(
      "This photo could not be made small enough to send. Try a closer shot of just the plan."
    );
  } finally {
    image.release();
  }
}
