import test from "node:test";
import assert from "node:assert/strict";
import { ENCLOSURES, PAVING_PATTERNS, DETAIL_SETS, DETAIL_SCOPES, groundsParts } from "./cityBuildingGrounds.ts";
import { COMPOSITIONS, applyComposition, newDesign, resolveV3 } from "./cityBuildingV3.ts";

test("all boundaries stay inside plots and leave a clear entrance at every detail level", () => {
  for (const enclosure of ENCLOSURES) for (const lod of ["near", "medium", "far"] as const) {
    const parts = groundsParts({enclosure}, lod);
    for (const p of parts) {
      assert.ok(Math.abs(p.position[0]) + p.size[0]/2 < 11.5);
      assert.ok(Math.abs(p.position[2]) + p.size[2]/2 < 11.5);
      if (p.position[2] > 10) assert.ok(Math.abs(p.position[0]) - p.size[0]/2 >= 2.1);
    }
  }
  for (const pavingPattern of PAVING_PATTERNS) {
    const parts = groundsParts({pavingPattern}, "near");
    assert.ok(parts.length <= 50);
    assert.ok(parts.every(p => p.position[1] + p.size[1]/2 < .31));
  }
});

test("detail sets and scopes change native finishes without changing structure or branding", () => {
  for (let i=0;i<COMPOSITIONS.length;i++) for (const detailSet of DETAIL_SETS) for (const detailScope of DETAIL_SCOPES) {
    const base = {...applyComposition(newDesign("detail-test"), i), finish: "facade" as const};
    const original = resolveV3(base, "#445566");
    const d = {...base, detailSet, detailScope};
    const result = resolveV3(d, "#445566");
    assert.deepEqual(result.masses, original.masses);
    assert.deepEqual(result.signs, original.signs);

    if (detailScope === "entrance") assert.ok(result.attachments.every(a => a.role !== "cornice"));
    if (detailScope === "crown") assert.ok(result.attachments.every(a => !["door", "entrance"].includes(a.role)));
    const family = {brick:"Brick", "white-brick":"WhiteBrick", marble:"Marble", metal:"Metal", matching:""}[detailSet];
    assert.ok(result.attachments.filter(a => ["facade", "cornice"].includes(a.role)).every(a => a.asset.includes(family)));
  }
});

test("enclosures and raised plot edges have explicit border materials",()=>{
 const d={...newDesign("border"),enclosure:"open-rail" as const};
 assert.ok(groundsParts(d,"near").every(p=>p.textureRole==="groundBorder"));
 const resolved=resolveV3(d,"#445566");
 assert.equal(resolved.parts.find(p=>p.position[1]===.05)?.textureRole,"groundBorder");
 assert.equal(resolved.parts.find(p=>p.position[1]===.2)?.textureRole,undefined);
});
