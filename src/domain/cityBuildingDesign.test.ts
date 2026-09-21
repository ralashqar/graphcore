import test from "node:test";
import assert from "node:assert/strict";
import {BUILDING_PRESETS,buildingParts,buildingMasses} from "./cityBuildingDesign.ts";
test("all bounded blueprints remain inside their tile, including upper terraces and planting",()=>{
 for(const preset of BUILDING_PRESETS) for(const floors of [1,8]) for(const width of [12,18]) for(const setback of [0,2]) {
  const d={...preset.design,floors,width,setback};
  for(const part of buildingParts(d,"#345678")) {
   assert.ok(part.position.every(Number.isFinite));
   assert.ok(part.size.every(v=>v>0));
   assert.ok(Math.abs(part.position[0])+part.size[0]/2<=12);
   assert.ok(Math.abs(part.position[2])+part.size[2]/2<=12);
  }
 }
});
test("presets produce distinct footprints and facade/tile controls change geometry",()=>{
 const prints=BUILDING_PRESETS.map(p=>JSON.stringify(buildingMasses(p.design)));
 assert.equal(new Set(prints).size,4);
 const d=BUILDING_PRESETS[0].design;
 assert.notDeepEqual(buildingParts(d,"#345678"),buildingParts({...d,facade:"piers",tile:"slate"},"#345678"));
 assert.ok(buildingParts({...d,landscaping:false},"#345678").every(p=>p.kind!=="tree"));
});
