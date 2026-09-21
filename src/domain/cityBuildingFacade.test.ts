import test from "node:test";
import assert from "node:assert/strict";
import { newDesign, normalizeV3, resolveV3 } from "./cityBuildingV3.ts";

test("native facades cover every eligible elevation and floor regardless of rhythm or accent scope", () => {
 for(const detailSet of ["brick","white-brick","marble","metal"] as const)
 for(const rhythm of ["vertical","ribbon","alternating"] as const)
 for(const detailScope of ["all","entrance","crown"] as const) {
  const d=normalizeV3({...newDesign("coverage"),blueprint:"office",width:18,depth:14,middleFloors:2,crown:"none",finish:"facade",detailSet,rhythm,detailScope,slots:{}});
  const near=resolveV3(d,"#446655","near"),medium=resolveV3(d,"#446655","medium");
  const tiles=near.attachments.filter(a=>a.role==="facade");
  assert.ok(tiles.length>0);
  assert.equal(new Set(tiles.map(a=>a.rotation)).size,4);
  for(const floor of near.masses) assert.ok(tiles.some(a=>Math.abs(a.position[1]-(floor.y+.18))<.001));
  assert.deepEqual(medium.attachments.filter(a=>a.role==="facade"),tiles);
  assert.equal(new Set(tiles.map(a=>a.scale)).size,1);
  assert.ok(near.parts.filter(p=>p.fallback==="facade").every(p=>p.fallbackAsset && tiles.some(a=>a.asset===p.fallbackAsset)));
  assert.ok(!near.attachments.some(a=>a.role==="cornice"));
 }
});
test("accents use solid structural roof trim rather than exposed source cornice strips",()=>{
 const r=resolveV3({...newDesign("trim"),finish:"accents"},"#446655");
 assert.ok(!r.attachments.some(a=>a.asset.startsWith("Cornice")));
 assert.ok(r.attachments.some(a=>a.role==="entrance"));
 assert.ok(r.parts.some(p=>p.kind==="box"));
});
