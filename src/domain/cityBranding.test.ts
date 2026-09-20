import test from "node:test";
import assert from "node:assert/strict";
import { billboardImageRect } from "./cityBranding.ts";
test("portrait and landscape images fill the sign with bounded focal positioning", () => {
  assert.deepEqual(billboardImageRect(100, 100), {
    x: 0,
    y: -128,
    width: 512,
    height: 512,
  });
  assert.deepEqual(billboardImageRect(1024, 256, { x: 100, y: 50, zoom: 1 }), {
    x: -512,
    y: 0,
    width: 1024,
    height: 256,
  });
  const r = billboardImageRect(640, 960, { x: 0, y: 100, zoom: 2 });
  assert.ok(r.x === 0);
  assert.equal(r.y + r.height, 256);
  assert.ok(r.width >= 512);
  assert.deepEqual(
    billboardImageRect(512, 256, { x: NaN, y: Infinity, zoom: NaN }),
    { x: 0, y: 0, width: 512, height: 256 },
  );
});
