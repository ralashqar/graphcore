import { advertisingLayout } from "./cityAdvertising.ts";
import { buildingMasses } from "./cityBuildingDesign.ts";
import { buildingSlots } from "./cityBuildingV3.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { demoBuildingDesign } from "./cityDemoDesign.ts";
import { resolveV3 } from "./cityBuildingV3.ts";
test("demo designs are stable, varied and bounded across a full city", () => {
 const designs = Array.from({length:400}, (_,i)=>demoBuildingDesign(i,"#506b58"));
 assert.deepEqual(designs[17],demoBuildingDesign(17,"#506b58"));
 assert.equal(new Set(designs.map(d=>d.enclosure)).size,4);
 assert.equal(new Set(designs.map(d=>d.finish)).size,3);
 assert.equal(new Set(designs.map(d=>d.archetype).filter(Boolean)).size,6);
 assert.equal(new Set(designs.map(d=>d.pavingPattern)).size,5);
 for(const d of designs) {
  assert.ok(d.floors<=8);
  assert.ok(d.advertising!.placements.length>=1 && d.advertising!.placements.length<=2);
  const masses=buildingMasses(d);
  const ads=advertisingLayout(d,masses,buildingSlots(d,masses));
  assert.equal(ads.signs.length,d.advertising!.placements.length);
  for(const part of resolveV3(d,"#506b58","medium").parts) {
   assert.ok(Math.abs(part.position[0])+part.size[0]/2<=12);
   assert.ok(Math.abs(part.position[2])+part.size[2]/2<=12);
  }
 }
});
