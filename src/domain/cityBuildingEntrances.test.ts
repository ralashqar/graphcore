import test from "node:test";
import assert from "node:assert/strict";
import { frontStructure } from "./cityBuildingEntrances.ts";
import { applyComposition, COMPOSITIONS, newDesign, resolveV3 } from "./cityBuildingV3.ts";

test("compact kiosks are one storey and porticos remain open and bounded", () => {
  for (const name of ["Canopy kiosk", "Gabled kiosk"]) {
    const d = applyComposition(newDesign("fixture"), COMPOSITIONS.findIndex(p => p.name === name));
    assert.equal(d.width, 8); assert.equal(d.depth, 8); assert.equal(d.floors, 1);
    assert.equal(resolveV3(d, "#445566").masses[0].width, 8);
  }
  for (const name of ["City museum", "Civic bank"]) {
    const d = applyComposition(newDesign("fixture"), COMPOSITIONS.findIndex(p => p.name === name));
    const r = resolveV3(d, "#445566");
    assert.equal(r.parts.filter(p => p.kind === "column").length, 2);
    assert.ok(r.slots.find(s => s.id === "brand.entrance")?.active);
    assert.ok(!r.slots.find(s => s.id === "canopy.entrance")?.active);
    for (const p of r.parts) {
      assert.ok(Math.abs(p.position[0]) + p.size[0]/2 <= 11.8);
      assert.ok(Math.abs(p.position[2]) + p.size[2]/2 <= 11.8);
      if (p.kind === "column") assert.ok(Math.abs(p.position[0]) - p.size[0]/2 > 1.6);
    }
    const resized = {...d, depth:18};
    assert.equal(resolveV3(resized, "#445566").parts.filter(p => p.kind === "column").length, 0);
    assert.ok(frontStructure(d.entranceStyle, "office", 9, d.width, d.groundHeight, "#fff", "#fff").reason);
    assert.equal(resized.entranceStyle, d.entranceStyle);
    assert.equal(resolveV3(d, "#445566").parts.filter(p => p.kind === "column").length, 2);
  }
});

test("wide canopy reserves the whole storefront without leaving its plot", () => {
  const d = applyComposition(newDesign("fixture"), COMPOSITIONS.findIndex(p => p.name === "Terrace cafe"));
  const canopy = resolveV3(d, "#445566").slots.find(s => s.id === "canopy.entrance")!;
  assert.equal(canopy.size[0], 10);
  assert.ok(canopy.active);
});
