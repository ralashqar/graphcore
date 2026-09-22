import test from "node:test";
import assert from "node:assert/strict";
import {COMPOSITIONS,applyComposition,newDesign,resolveV3,normalizeV3,massesV3} from "./cityBuildingV3.ts";
import {roofFaces,connectedRoof,connectedPorch} from "./cityConnectedArchitecture.ts";
const indices=COMPOSITIONS.flatMap((p,i)=>p.patch.base==="residential"?[i]:[]);
test("eight residential presets resolve finite bounded geometry at dimension extremes",()=>{
 assert.equal(indices.length,8);
 for(const i of indices)for(const max of [false,true])for(const profile of ["standard","hip","shed","mansard"] as const){
  let d=applyComposition(newDesign("residential"),i);
  d=normalizeV3({...d,width:max?18:d.blueprint==="office"?8:12,depth:max?18:d.blueprint==="office"?8:10,middleFloors:max?7:0,roofVariant:profile,connectedArchitecture:{...d.connectedArchitecture,roofPitch:max?50:15,roofOverhang:max?.6:0,dormers:2,shutters:true,windowBoxes:true}});
  const r=resolveV3(d,"#456789");assert.ok(r.parts.length>0);
  for(const part of r.parts){assert.ok(part.position.every(Number.isFinite));assert.ok(part.size.every(n=>Number.isFinite(n)&&n>0),JSON.stringify(part));if(part.vertices){assert.equal(part.vertices.length%9,0);assert.ok(part.vertices.every(Number.isFinite));for(let j=0;j<part.vertices.length;j+=3){assert.ok(Math.abs(part.vertices[j])<=11);assert.ok(Math.abs(part.vertices[j+2])<=11);}}}
 }
});
test("roof face envelope has no overlapping surface ownership",()=>{
 const masses=[{x:-2,z:0,y:.65,height:3,width:8,depth:12},{x:3,z:3,y:.65,height:3,width:6,depth:6}];
 for(const profile of ["gable","hip","shed","mansard"]){
  const faces=roofFaces(masses,profile,35,.3,"x");assert.ok(faces.length>0);
  for(let x=-5.91;x<6;x+=.273)for(let z=-5.93;z<6;z+=.319){
   const owners=faces.filter(f=>f.polygon.every((a,i)=>{const b=f.polygon[(i+1)%f.polygon.length];return (b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>1e-7;}));
   assert.ok(owners.length<=1,`${profile} duplicate roof at ${x},${z}`);
  }
 }
});
test("porches have supported posts and a clear central entrance",()=>{
 for(const i of indices){const d=applyComposition(newDesign("porch"),i),m=massesV3(d),r=connectedPorch(m,d.connectedArchitecture!,d.palette,m[0].z+m[0].depth/2);
  for(const p of r.parts)assert.ok(p.size.every(n=>n>0));
  if(d.connectedArchitecture?.porch!=="none")assert.equal(r.envelopes.filter(e=>e.label==="Porch clearance").length,1);
 }
});
test("connected recipes are deterministic and older revisions ignore new options",()=>{
 const d=applyComposition(newDesign("stable"),indices[2]);assert.deepEqual(resolveV3(d,"#456789"),resolveV3(structuredClone(d),"#456789"));
 const legacy=newDesign("old");assert.deepEqual(resolveV3(legacy,"#456789"),resolveV3({...legacy,connectedArchitecture:{dormers:2,porch:"veranda"}},"#456789"));
});
test("dormers are bounded and can be inactive without losing authored selection",()=>{
 const d=applyComposition(newDesign("dormer"),indices[2]),m=massesV3(d);
 const flat=connectedRoof(m,"flat",{dormers:2},d.palette,"near");assert.ok(flat.notes.some(n=>n.includes("Dormers")));
 const pitched=connectedRoof(m,"gable",{dormers:2},d.palette,"near");assert.equal(pitched.notes.length,0);assert.ok(pitched.parts.some(p=>p.kind==="roof"));
});
