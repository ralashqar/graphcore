import test from "node:test";
import assert from "node:assert/strict";
import {DOOR_FAMILIES,DOOR_SURROUNDS,proceduralEntrance} from "./cityProceduralEntrances.ts";
import {DEFAULT_DESIGN_V2} from "./cityBuildingV2.ts";
import {newDesign,resolveV3,applyComposition,COMPOSITIONS} from "./cityBuildingV3.ts";
test("door assemblies remain within their shared aperture with positive geometry",()=>{
 for(const family of DOOR_FAMILIES)for(const surround of DOOR_SURROUNDS)for(const transom of [true,false])for(const lod of ["near","medium","far"] as const){
  const parts=proceduralEntrance(family,surround,transom,6,DEFAULT_DESIGN_V2.palette,lod);
  for(const p of parts){assert.ok(p.size.every(n=>Number.isFinite(n)&&n>0));assert.ok(Math.abs(p.position[0])+p.size[0]/2<=1.00001);assert.ok(p.position[1]-p.size[1]/2>=.65-1e-6);assert.ok(p.position[1]+p.size[1]/2<=3.05+1e-6);}
 }
});
test("all presets accept fitted doors without invoking native entrance ownership",()=>{
 for(let i=0;i<COMPOSITIONS.length;i++)for(const doorFamily of DOOR_FAMILIES){
  const d={...applyComposition(newDesign("door"),i),finish:"procedural" as const,doorFamily,doorSurround:"classical" as const,doorTransom:true};
  const r=resolveV3(d,"#556677");assert.ok(r.parts.length);assert.ok(!r.attachments.some(a=>a.role==="door"));
 }
});
test("native finish retains ownership regardless of stored procedural door choice",()=>{
 const d={...newDesign("native"),finish:"facade" as const};
 assert.deepEqual(resolveV3(d,"#556677"),resolveV3({...d,doorFamily:"french",doorTransom:true},"#556677"));
});
