import assert from "node:assert/strict";
import { fitWithin, MAX_IMAGE_EDGE_PX, MAX_UPLOAD_BYTES } from "./uploadLimits";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

run("a landscape phone photo shrinks to 1920 on its long side", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1920, height: 1440 });
});

run("a portrait phone photo shrinks to 1920 on its long side", () => {
  assert.deepEqual(fitWithin(3000, 4000), { width: 1440, height: 1920 });
});

run("an image already inside the limit keeps its size", () => {
  assert.deepEqual(fitWithin(1280, 960), { width: 1280, height: 960 });
  assert.deepEqual(fitWithin(MAX_IMAGE_EDGE_PX, 1000), { width: MAX_IMAGE_EDGE_PX, height: 1000 });
});

run("a very thin image never collapses to zero pixels", () => {
  assert.deepEqual(fitWithin(8000, 1), { width: 1920, height: 1 });
});

run("the upload cap stays under Vercel's 4.5 MB function body limit", () => {
  assert.ok(MAX_UPLOAD_BYTES < 4.5 * 1024 * 1024);
});
