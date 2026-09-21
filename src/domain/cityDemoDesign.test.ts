import { advertisingLayout } from "./cityAdvertising.ts";
import { buildingMasses } from "./cityBuildingDesign.ts";
import { buildingSlots } from "./cityBuildingV3.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NATIVE_FACADES } from "./cityNativeFacades.ts";
import { demoBuildingDesign } from "./cityDemoDesign.ts";
import { resolveV3 } from "./cityBuildingV3.ts";
test("demo designs are stable, varied and bounded across a full city", () => {
 const designs = Array.from({length:400}, (_,i)=>demoBuildingDesign(i,"#506b58"));
 assert.deepEqual(new Set(designs.map(d => d.textures?.ground)), new Set(["pavers", "concrete", "grass-lawn", "grass-meadow", "grass-lush"]));
 assert.ok(designs.every(d => d.pavingPattern !== "checker"));
 const facades = designs.filter(d => d.finish === "facade");
 assert.deepEqual(new Set(facades.map(d => d.nativeFacade)), new Set(NATIVE_FACADES.map(f => f.id)));
 assert.equal(new Set(facades.slice(0, NATIVE_FACADES.length).map(d => d.nativeFacade)).size, NATIVE_FACADES.length);
 for (let i = designs.length - 1; i >= 0; i--) assert.deepEqual(designs[i], demoBuildingDesign(i, "#506b58"));
 assert.deepEqual(designs[17],demoBuildingDesign(17,"#506b58"));
 assert.equal(new Set(designs.map(d=>d.enclosure)).size,4);
 assert.equal(new Set(designs.map(d=>d.finish)).size,3);
 assert.equal(new Set(designs.map(d=>d.archetype).filter(Boolean)).size,6);
 assert.equal(new Set(designs.map(d=>d.pavingPattern)).size,4);
 assert.equal(new Set(designs.map(d=>d.textures?.wall)).size,6);
 for(const d of designs) {
  for (const role of ["wall", "roof", "ground"] as const) {
   assert.ok(d.textures?.[role]);
   if (role !== "wall" || d.finish !== "facade") assert.notEqual(d.textures[role],"none");
  }
  if (d.finish !== "facade") assert.notEqual(d.textures?.wallBorder,d.textures?.wall);
  assert.notEqual(d.textures?.groundBorder,d.textures?.ground);
  assert.notEqual(d.textures?.wallBorder,"primary");
  assert.notEqual(d.textures?.groundBorder,"primary");
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
