import test from "node:test";
import assert from "node:assert/strict";
import { COMPOSITIONS, applyComposition, newDesign, resolveV3 } from "./cityBuildingV3.ts";
import { roofVariants } from "./cityBuildingArchetypes.ts";

test("hall and wings form a supported central hall with lower, non-overlapping wings", () => {
  const d = applyComposition(newDesign("hall"), COMPOSITIONS.findIndex(p => p.name === "City museum"));
  const r = resolveV3(d, "#446655");
  assert.equal(r.masses.filter(m => m.y === .65).length, 3);
  assert.equal(r.masses.filter(m => m.y === r.masses.at(-1)!.y).length, 1);
  for (const a of r.masses) for (const b of r.masses) {
    if (a === b || a.y !== b.y) continue;
    const xOverlap = Math.min(a.x+a.width/2,b.x+b.width/2)-Math.max(a.x-a.width/2,b.x-b.width/2);
    const zOverlap = Math.min(a.z+a.depth/2,b.z+b.depth/2)-Math.max(a.z-a.depth/2,b.z-b.depth/2);
    assert.ok(xOverlap <= .001 || zOverlap <= .001);
  }
});

test("compatible roof variants preserve building mass and keep all features within the plot", () => {
  for (let i=0;i<COMPOSITIONS.length;i++) {
    const d = applyComposition(newDesign("roof-test"),i);
    for (const roofVariant of roofVariants(d)) {
      const r = resolveV3({...d,roofVariant}, "#446655");
      assert.deepEqual(r.masses,resolveV3(d,"#446655").masses);
      for (const p of r.parts) {
        const c=Math.abs(Math.cos(p.rotation||0)),s=Math.abs(Math.sin(p.rotation||0));
        assert.ok(Math.abs(p.position[0])+(p.size[0]*c+p.size[2]*s)/2 <= 11.8);
        assert.ok(Math.abs(p.position[2])+(p.size[2]*c+p.size[0]*s)/2 <= 11.8);
      }
      if (roofVariant !== "standard") assert.ok(!r.slots.find(s => s.id === "brand.roof")?.active);
    }
  }
  assert.deepEqual(roofVariants({blueprint:"courtyard",archetype:"shop"}),["standard"]);
  assert.ok(!roofVariants({blueprint:"office",archetype:"bank"}).includes("sawtooth"));
});
