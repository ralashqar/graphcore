import test from "node:test";
import assert from "node:assert/strict";
import {joinedWallRange} from "./cityConnectedShell.ts";
import {exposedWalls} from "./cityBuildingV2.ts";
import {newDesign,resolveV3,applyComposition,COMPOSITIONS} from "./cityBuildingV3.ts";
test("convex joins have exactly one owner for each corner square",()=>{
 const walls=exposedWalls([{x:0,z:0,y:.65,width:10,depth:8,height:3}]);
 for(const wall of walls){const r=joinedWallRange(wall,walls,.3);assert.equal(r.right-r.left,wall.length-(wall.nx ? .6 : 0));}
});
test("new shell clears the main doorway across all presets and retains it at every detail",()=>{
 for(let i=0;i<COMPOSITIONS.length;i++)for(const lod of ["near","medium","far"] as const){
  const d={...applyComposition(newDesign("shell"),i),finish:"procedural" as const};
  const r=resolveV3(d,"#334455",lod);
  assert.ok(r.parts.every(p=>p.size.every(n=>Number.isFinite(n)&&n>0)));
  const front=r.walls.filter(w=>w.nz===1&&w.y===.65&&Math.abs(w.x)<w.length/2).sort((a,b)=>b.z-a.z)[0];
  const obstructing=r.parts.filter(p=>p.squareEdges&&p.color===d.palette.wall&&p.position[0]-p.size[0]/2<.8&&p.position[0]+p.size[0]/2>-.8&&p.position[1]-p.size[1]/2<2.7&&p.position[1]+p.size[1]/2>1&&p.position[2]+p.size[2]/2>=front.z-.01&&p.position[2]-p.size[2]/2<=front.z);
  assert.equal(obstructing.length,0,COMPOSITIONS[i].name+lod);
 }
});
